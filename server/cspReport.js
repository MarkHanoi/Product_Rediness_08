/**
 * @file server/cspReport.js
 * @description CSP violation-report sink — the evidence base for safely
 * completing the strict-CSP tightening (C51 §3.1.2 / §3.1.2.2).
 *
 * WHY THIS EXISTS
 *   C51 §3.1.2 wants a strict CSP, but two directives (`script-src` without
 *   `unsafe-eval`, `style-src` without `unsafe-inline`) and the residual blanket
 *   `wss:` cannot be tightened blind without risking breakage for thousands of
 *   users. The enterprise-correct path is: enforce the current (safe) policy,
 *   collect REAL violation telemetry from production via `report-uri`, then
 *   narrow each directive from evidence. This module is that sink.
 *
 * DESIGN NOTES
 *   - Public + unauthenticated: browsers POST reports without credentials.
 *   - Accepts both report shapes: legacy `application/csp-report`
 *     (`{ "csp-report": {…} }`) and the Reporting API `application/reports+json`
 *     (an array of `{ type, body }`).
 *   - 8 KB body cap + a per-minute rate cap so a misbehaving extension or a
 *     CSP misconfig cannot flood the logs (a real production failure mode).
 *   - Answers 204 immediately; the sink never affects the user's request.
 *
 * @see docs/02-decisions/contracts/C51-APEX-APP-DEPLOYMENT-SPLIT.md §3.1.2.2
 */

import express from 'express';

/** The single path the CSP `report-uri` points at (shared with securityHeaders.js). */
export const CSP_REPORT_PATH = '/api/security/csp-report';

// Body parser for the two CSP report content-types, size-capped. Mounted only
// on the report route so it never touches the rest of the app's parsing.
export const cspReportBodyParser = express.json({
    type: ['application/csp-report', 'application/reports+json', 'application/json'],
    limit: '8kb',
});

// ── Rate cap ────────────────────────────────────────────────────────────────
// A single noisy client can emit thousands of reports a minute. Cap how many we
// LOG per window and count the rest, so the signal survives without the log
// volume becoming the incident.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 100;
let _windowStart = 0;
let _logged = 0;
let _dropped = 0;

/** Normalise either report shape to the three fields we act on. */
function normaliseReport(report) {
    const r = (report && (report['csp-report'] || report.body)) || report || {};
    return {
        directive: r['effective-directive'] || r['violated-directive'] || r.effectiveDirective || r.violatedDirective || '?',
        blocked: r['blocked-uri'] || r.blockedURL || '?',
        document: r['document-uri'] || r.documentURL || '?',
    };
}

const trunc = (v, n) => String(v ?? '?').slice(0, n);

/**
 * Express handler for POST {CSP_REPORT_PATH}. Logs each violation (rate-capped)
 * and answers 204. Exported for direct unit testing.
 */
export function cspReportHandler(req, res) {
    // Answer first — the sink must never slow or fail the reporting client.
    res.status(204).end();

    const now = Date.now();
    if (now - _windowStart > WINDOW_MS) {
        if (_dropped > 0) console.warn(`[csp-report] dropped ${_dropped} report(s) in the last window (cap ${MAX_PER_WINDOW}/min)`);
        _windowStart = now;
        _logged = 0;
        _dropped = 0;
    }

    const body = req.body;
    const reports = Array.isArray(body) ? body : (body ? [body] : []);
    for (const rep of reports) {
        if (_logged >= MAX_PER_WINDOW) { _dropped++; continue; }
        _logged++;
        const { directive, blocked, document } = normaliseReport(rep);
        // Structured + truncated; this is the evidence for C51 §3.1.2.2 narrowing.
        console.warn(`[csp-report] directive=${trunc(directive, 40)} blocked=${trunc(blocked, 160)} doc=${trunc(document, 160)}`);
    }
}

/** Test-only hook to reset the rate-cap window between unit tests. */
export function __resetCspRateCap() {
    _windowStart = 0;
    _logged = 0;
    _dropped = 0;
}
