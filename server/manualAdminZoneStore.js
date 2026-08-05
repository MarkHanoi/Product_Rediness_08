/**
 * @file server/manualAdminZoneStore.js
 * @description Persistence + server-side gating for the manual-admin-zone-entry testing shortcut.
 *
 * WHAT THIS IS — see
 * `docs/04-reference/jurisdictions/es/es-an/14021-cordoba/findings/TRACED-ZONE-SERVICE-2026-08-05.md`
 * and `DIGITIZATION-TOOLING-SCOPE-2026-08-05.md` for the full "why". In one line: a small,
 * hard-coded allowlist of named admins (`server/adminAllowlist.js`) can type a zone + subzone code
 * for a parcel and see a REAL computed envelope for it IMMEDIATELY, in THEIR OWN session only — no
 * git commit, no deploy, no founder sign-off gate. It is a completely separate, additive mechanism
 * from every `*_ENVELOPE_VERIFIED` / `*_TRACED_ZONES_VERIFIED` flag; it never reads or writes any of
 * them, and it can never become visible to a non-admin or to a DIFFERENT admin than the one who
 * entered it (see `resolveManualAdminZone`'s doc comment for that scoping decision).
 *
 * ⚠⚠ SERVER-SIDE ENFORCEMENT IS THE WHOLE POINT. Both `saveManualAdminZone` (write) and
 * `resolveManualAdminZone` (read) take the REQUESTING caller's email as an explicit, separate
 * argument from any entry data, and both re-check `isPryzmAdmin()` themselves — never assume a
 * caller (e.g. `server.js`'s route handler) already checked. A route handler that forgot the check
 * is a bug in the route handler, not a reason for this module to trust it. `server.js`'s
 * `/api/manual-zone/*` routes ALSO check `isPryzmAdmin()` before calling in, so the check is
 * deliberately redundant (defense in depth), matching the existing `PRYZM_OWNER_EMAIL` gating idiom
 * already used at `/api/export/authorize`, `/api/me/plan`, etc. in `server.js`.
 *
 * PERSISTENCE — a real Postgres table (`manual_admin_zones`, `server/dbMigrate.js`), not a
 * git-tracked JSON file: the entire point of this feature is to skip the commit/deploy cycle. When
 * no PG pool is configured (local dev with no DATABASE_URL), falls back to an in-memory Map so the
 * feature still works for manual testing — this fallback is NOT multi-instance-safe and is
 * documented as such; production always has DATABASE_URL configured (required env, see CLAUDE.md).
 *
 * JURISDICTION-AGNOSTIC BY DESIGN — keyed by (jurisdiction, lat, lon) plus a free-form `payload`
 * JSONB blob for jurisdiction-specific fields, not hardcoded to Córdoba columns. Only the CALLER
 * (today: `resolveCordobaManualAdminZone.ts` via a `/api/manual-zone/resolve` fetch) is Córdoba-
 * specific; this store itself has no Córdoba-only assumptions.
 *
 * MATCHING TOLERANCE — a query point rarely lands on the EXACT lat/lon an admin typed the entry
 * against (a parcel click vs. a centroid, floating-point serialisation, etc.). `resolveManualAdminZone`
 * matches the CLOSEST entry (by the same admin, same jurisdiction) within `MATCH_RADIUS_METERS`
 * (60 m — comfortably inside one urban parcel, per Córdoba's own traced-zone polygons, which run
 * ~75 m across — and far short of jumping to a neighbouring parcel). This is a pragmatic default,
 * not a cited spec; a future revision could accept an explicit parcel/site id instead once the
 * calling UI has one to hand.
 */

'use strict';

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { isPryzmAdmin } from './adminAllowlist.js';

const tracer = trace.getTracer('pryzm.manual-admin-zone');

/** Radius (metres) within which a query point is considered "the same parcel" as a saved entry. */
export const MATCH_RADIUS_METERS = 60;

/** The honest provenance method tag for every row this store writes — distinct from Córdoba's
 * existing `"manual_digitization"` tag (`packages/site-parcel-data/src/providers/data/cordobaTracedZones.json`),
 * which is a hand-TRACED polygon read off a scanned sheet. This is an admin typing a zone CODE
 * directly, with no geometry trace at all — a materially different, and materially weaker, claim. */
export const MANUAL_ADMIN_ENTRY_METHOD = 'manual_admin_entry';

// ── In-memory fallback (no DB configured) ─────────────────────────────────────────────────────
// Not multi-instance-safe. Only used when getPgPool() returns null (e.g. local dev without
// DATABASE_URL). Keyed by a synthetic id; scanned linearly on read (fine at this scale).
const _memoryRows = new Map();
let _memorySeq = 0;

function _haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * @typedef {Object} ManualAdminZoneEntryInput
 * @property {string} jurisdiction   e.g. 'es-cordoba'
 * @property {number} lat
 * @property {number} lon
 * @property {string} zoneCode
 * @property {string} [subzoneCode]
 * @property {Record<string, unknown>} [payload]  jurisdiction-specific extra fields
 * @property {string} [notes]
 */

/**
 * @typedef {Object} ManualAdminZoneRow
 * @property {string} id
 * @property {string} jurisdiction
 * @property {number} lat
 * @property {number} lon
 * @property {string} zoneCode
 * @property {string | null} subzoneCode
 * @property {Record<string, unknown>} payload
 * @property {string} method
 * @property {string} enteredByEmail
 * @property {string | null} enteredById
 * @property {string} enteredAt  ISO timestamp
 * @property {string | null} notes
 */

/**
 * Saves a manual admin zone entry. ADMIN-GATED: throws a typed `{ code: 'forbidden' }` error if
 * `callerEmail` is not on the `PRYZM_ADMIN` allowlist — the route handler is expected to translate
 * that into an HTTP 403, but this function enforces it independently regardless of what the route
 * does. Computes and dispatches IMMEDIATELY on the read side (`resolveManualAdminZone`) — there is
 * no separate publish/approve step.
 *
 * @param {ManualAdminZoneEntryInput} input
 * @param {{ email: string | null, userId?: string | null }} caller
 * @param {{ getPgPool?: () => any }} [deps]  injectable for tests
 * @returns {Promise<ManualAdminZoneRow>}
 */
export async function saveManualAdminZone(input, caller, deps = {}) {
    const span = tracer.startSpan('pryzm.manual_admin_zone.save');
    try {
        const callerEmail = caller?.email ?? null;
        span.setAttribute('jurisdiction', String(input?.jurisdiction ?? ''));
        if (!isPryzmAdmin(callerEmail)) {
            span.setAttribute('result', 'forbidden');
            span.setStatus({ code: SpanStatusCode.OK });
            const err = new Error('Forbidden — manual zone entry requires an allowlisted admin account.');
            err.code = 'forbidden';
            throw err;
        }
        if (
            !input ||
            typeof input.jurisdiction !== 'string' || !input.jurisdiction.trim() ||
            typeof input.lat !== 'number' || !Number.isFinite(input.lat) ||
            typeof input.lon !== 'number' || !Number.isFinite(input.lon) ||
            typeof input.zoneCode !== 'string' || !input.zoneCode.trim()
        ) {
            span.setAttribute('result', 'invalid-input');
            span.setStatus({ code: SpanStatusCode.OK });
            const err = new Error('jurisdiction, lat, lon, and zoneCode are required.');
            err.code = 'invalid-input';
            throw err;
        }

        const row = {
            id: `mz_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
            jurisdiction: input.jurisdiction.trim(),
            lat: input.lat,
            lon: input.lon,
            zoneCode: input.zoneCode.trim(),
            subzoneCode: input.subzoneCode ? String(input.subzoneCode).trim() : null,
            payload: input.payload && typeof input.payload === 'object' ? input.payload : {},
            method: MANUAL_ADMIN_ENTRY_METHOD,
            enteredByEmail: callerEmail.toLowerCase().trim(),
            enteredById: caller?.userId ?? null,
            enteredAt: new Date().toISOString(),
            notes: input.notes ? String(input.notes) : null,
        };

        const getPgPool = deps.getPgPool ?? (await _defaultGetPgPool());
        const pool = getPgPool ? getPgPool() : null;

        if (pool) {
            await pool.query(
                `INSERT INTO manual_admin_zones
                    (id, jurisdiction, lat, lon, zone_code, subzone_code, payload, method,
                     entered_by_email, entered_by_id, entered_at, notes)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
                [
                    row.id, row.jurisdiction, row.lat, row.lon, row.zoneCode, row.subzoneCode,
                    JSON.stringify(row.payload), row.method, row.enteredByEmail, row.enteredById,
                    row.enteredAt, row.notes,
                ],
            );
        } else {
            _memoryRows.set(row.id, row);
            _memorySeq += 1;
        }

        span.setAttribute('result', 'ok');
        span.setAttribute('zoneCode', row.zoneCode);
        span.setStatus({ code: SpanStatusCode.OK });
        return row;
    } catch (err) {
        if (err?.code !== 'forbidden' && err?.code !== 'invalid-input') {
            span.setStatus({ code: SpanStatusCode.ERROR, message: err?.message ?? String(err) });
        }
        throw err;
    } finally {
        span.end();
    }
}

/**
 * Resolves the CLOSEST manual admin zone entry for a (jurisdiction, lat, lon) query, scoped
 * STRICTLY to entries authored by `callerEmail` itself.
 *
 * SCOPING DECISION (explicit, per the task's own "note this choice" instruction): an admin's manual
 * entry is visible ONLY in that same admin's own session — even a second allowlisted admin querying
 * the exact same coordinates sees nothing from this store (falls through to the normal, unaffected
 * resolution chain). Rationale: this is a per-admin scratch/testing tool, entries are one-off and
 * often exploratory/wrong-on-purpose while testing a rule pack; auto-sharing them across admins
 * would silently turn one person's in-progress guess into another's "real" envelope with no review
 * step — exactly the kind of gate-widening §CONTEXT-DATA-HONESTY exists to prevent. If cross-admin
 * sharing is later wanted, that is a deliberate product decision (e.g. a `shared: true` flag on the
 * row), not a default.
 *
 * ADMIN-GATED: returns `{ ok: false, reason: 'forbidden' }` (never throws, never leaks whether ANY
 * entry exists) if `callerEmail` is not on the allowlist.
 *
 * @param {{ jurisdiction: string, lat: number, lon: number }} query
 * @param {{ email: string | null }} caller
 * @param {{ getPgPool?: () => any }} [deps]
 * @returns {Promise<{ ok: true, entry: ManualAdminZoneRow, distanceMeters: number } | { ok: false, reason: string }>}
 */
export async function resolveManualAdminZone(query, caller, deps = {}) {
    const span = tracer.startSpan('pryzm.manual_admin_zone.resolve');
    try {
        const callerEmail = caller?.email ?? null;
        span.setAttribute('jurisdiction', String(query?.jurisdiction ?? ''));
        if (!isPryzmAdmin(callerEmail)) {
            span.setAttribute('result', 'forbidden');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'forbidden' };
        }
        if (
            !query ||
            typeof query.jurisdiction !== 'string' || !query.jurisdiction.trim() ||
            typeof query.lat !== 'number' || !Number.isFinite(query.lat) ||
            typeof query.lon !== 'number' || !Number.isFinite(query.lon)
        ) {
            span.setAttribute('result', 'invalid-input');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'invalid-input' };
        }

        const normalizedEmail = callerEmail.toLowerCase().trim();
        const getPgPool = deps.getPgPool ?? (await _defaultGetPgPool());
        const pool = getPgPool ? getPgPool() : null;

        /** @type {ManualAdminZoneRow[]} */
        let candidates = [];
        if (pool) {
            const { rows } = await pool.query(
                `SELECT id, jurisdiction, lat, lon, zone_code, subzone_code, payload, method,
                        entered_by_email, entered_by_id, entered_at, notes
                 FROM manual_admin_zones
                 WHERE jurisdiction = $1 AND entered_by_email = $2
                 ORDER BY entered_at DESC
                 LIMIT 500`,
                [query.jurisdiction.trim(), normalizedEmail],
            );
            candidates = rows.map((r) => ({
                id: r.id,
                jurisdiction: r.jurisdiction,
                lat: r.lat,
                lon: r.lon,
                zoneCode: r.zone_code,
                subzoneCode: r.subzone_code ?? null,
                payload: r.payload ?? {},
                method: r.method,
                enteredByEmail: r.entered_by_email,
                enteredById: r.entered_by_id ?? null,
                enteredAt:
                    r.entered_at instanceof Date ? r.entered_at.toISOString() : String(r.entered_at),
                notes: r.notes ?? null,
            }));
        } else {
            candidates = Array.from(_memoryRows.values()).filter(
                (r) => r.jurisdiction === query.jurisdiction.trim() && r.enteredByEmail === normalizedEmail,
            );
        }

        let best = null;
        let bestDist = Infinity;
        for (const c of candidates) {
            const d = _haversineMeters(query.lat, query.lon, c.lat, c.lon);
            if (d <= MATCH_RADIUS_METERS && d < bestDist) {
                best = c;
                bestDist = d;
            }
        }

        if (!best) {
            span.setAttribute('result', 'no-match');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-match' };
        }

        span.setAttribute('result', 'ok');
        span.setAttribute('zoneCode', best.zoneCode);
        span.setAttribute('distanceMeters', bestDist);
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: true, entry: best, distanceMeters: bestDist };
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: err?.message ?? String(err) });
        console.warn('[manualAdminZoneStore] resolve failed (non-fatal):', err?.message ?? err);
        return { ok: false, reason: 'data-unavailable' };
    } finally {
        span.end();
    }
}

async function _defaultGetPgPool() {
    try {
        const mod = await import('./pgClient.js');
        return mod.getPgPool;
    } catch {
        return null;
    }
}

/** Test-only: clears the in-memory fallback store between test cases. */
export function _resetInMemoryStoreForTests() {
    _memoryRows.clear();
    _memorySeq = 0;
}
