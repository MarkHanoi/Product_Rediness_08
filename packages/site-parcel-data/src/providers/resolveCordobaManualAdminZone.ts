// Córdoba (INE 14021) — the MANUAL-ADMIN-ZONE resolver: a server-backed lookup against the
// `manual_admin_zones` Postgres table (`server/manualAdminZoneStore.js`, `server/dbMigrate.js`),
// for the small named `PRYZM_ADMIN` allowlist (`server/adminAllowlist.js`) to type a zone +
// subzone code for a parcel and see a REAL computed envelope IMMEDIATELY — no git commit, no
// deploy, no founder sign-off. Replaces the much slower full agent hand-tracing pass for one-off
// TEST parcels. See
// `docs/04-reference/jurisdictions/es/es-an/14021-cordoba/findings/TRACED-ZONE-SERVICE-2026-08-05.md`.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS, AND — LOUDLY — WHAT IT IS NOT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `resolveCordobaTracedZone.ts` is an OFFLINE join against a committed, hand-traced GEOMETRY
// extract, gated `CORDOBA_TRACED_ZONES_VERIFIED` (default OFF, founder sign-off only). THIS module
// is the opposite shape: a LIVE server round-trip against a table an admin wrote SECONDS ago, and
// it is admin-gated instead of sign-off-gated — it is honest by construction rather than by review,
// because the server (a) only ever returns an entry to the SAME admin session that wrote it (never
// leaks to another user, admin or not — see `resolveManualAdminZone`'s scoping note in
// `server/manualAdminZoneStore.js`) and (b) tags every row's `method` as `'manual_admin_entry'`, a
// distinct, weaker provenance tag from Córdoba's existing `'manual_digitization'`
// (`./data/cordobaTracedZones.json`) — a hand-traced polygon reading is a different, stronger claim
// than an admin typing a bare zone code with no geometry trace at all.
//
// ⚠⚠ THIS NEVER INHERITS ANY `*_ENVELOPE_VERIFIED` / `*_VERIFIED` FLAG. It does not read
// `CORDOBA_ENVELOPE_VERIFIED` or `CORDOBA_TRACED_ZONES_VERIFIED`, and dispatching a computed
// envelope from this source must never be read as satisfying either of those sign-offs — it is a
// completely separate, additive, per-admin-session testing mechanism.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS IS A LIVE FETCH, NOT AN OFFLINE JOIN
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The whole point is instant, no-deploy admin writes — there is no static asset to bundle. The
// server (`GET /api/manual-zone/resolve`) is the ONLY place that can safely answer "is the caller
// an allowlisted admin, and does THIS entry belong to them" — a client-side check would be
// trivially bypassable. `deps.authToken` is therefore load-bearing: without one, this resolver
// never calls the network at all (see `resolveCordobaManualAdminZone` below) — there is nothing to
// gain from hitting the endpoint as an anonymous/unauthenticated caller, since the server would
// reject it anyway, and skipping the call keeps this resolver a true no-op for every ordinary user
// session (byte-for-byte unchanged production behaviour for the non-admin path, matching every
// other honesty-gated resolver in this package).
//
// THREE HONESTY PROPERTIES (mirrors `resolveCordobaTracedZone` / `resolveTeldeZone`):
//   1. IT NEVER THROWS. A network failure, a 403, a malformed response, or no match all return a
//      typed refusal.
//   2. IT DOES NOT DECIDE TO RENDER. It resolves the zone CODE + payload only; the dispatcher
//      (`applyCordobaManualAdminZoneThenFallback` in `siteDispatch.ts`) decides.
//   3. IT NEVER WIDENS A MATCH beyond what the server itself matched (a bounded-radius nearest
//      lookup scoped to the caller's own entries — see `MATCH_RADIUS_METERS` server-side).
//
// PURITY: this module performs I/O (a `fetch`), so it is NOT L2-pure like `resolveCordobaTracedZone`
// — it is the client-side analogue of `resolveCordobaSubzone`'s live-WFS shape, applied to PRYZM's
// own admin-entry API instead of a municipal WFS. OTel span `pryzm.zoning.resolveCordobaManualAdminZone`
// (C58 §1.10 / P8).

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { isInCordobaMunicipality } from './cordobaBbox.js';

const tracer = trace.getTracer('pryzm.zoning');

/** A WGS84 point — the frame this resolver queries the manual-admin-zone API by. */
export interface CordobaManualAdminZoneLngLat {
    readonly lat: number;
    readonly lon: number;
}

/** Injectable dependencies — tests supply a fake fetch; production supplies the real one + token. */
export interface CordobaManualAdminZoneDeps {
    /** Override the fetch implementation (tests only; production defaults to `globalThis.fetch`). */
    readonly fetchImpl?: typeof fetch;
    /**
     * The caller's own bearer token (from client-side auth storage). ⚠ REQUIRED for any network
     * call to happen at all — `undefined`/`null`/`''` means "no known session", and this resolver
     * short-circuits to a typed refusal WITHOUT calling fetch (see the file header's §WHY note).
     */
    readonly authToken?: string | null;
    /** Override the API base path (tests only; production defaults to same-origin `/api`). */
    readonly baseUrl?: string;
}

/** Why a Córdoba manual-admin-zone resolution refused. Closed vocabulary — operationally distinct. */
export type CordobaManualAdminZoneRefusalReason =
    /** No usable WGS84 point was supplied. */
    | 'no-point'
    /** The point falls outside the Córdoba municipal bbox — not this store's business. */
    | 'out-of-cordoba'
    /** No known session token — this resolver never calls the network without one. */
    | 'not-authenticated'
    /** The server rejected the caller as not on the `PRYZM_ADMIN` allowlist. */
    | 'forbidden'
    /** Authenticated + allowlisted, but no manual entry matches this point (or it is someone else's). */
    | 'no-match'
    /** The API call itself failed (network error, non-2xx, malformed body) — not a user condition. */
    | 'data-unavailable';

export interface CordobaManualAdminZoneResolution {
    readonly zoneCode: string;
    readonly subzoneCode: string | null;
    readonly payload: Readonly<Record<string, unknown>>;
    readonly enteredByEmail: string;
    readonly enteredAt: string;
    readonly notes: string | null;
    /** ⚠ Always state this verbatim next to any number this resolution feeds. */
    readonly provenance: string;
}

export type CordobaManualAdminZoneResult =
    | { readonly ok: true; readonly resolution: CordobaManualAdminZoneResolution }
    | { readonly ok: false; readonly reason: CordobaManualAdminZoneRefusalReason };

/**
 * Resolve a Córdoba parcel's zone code against the caller's OWN manual admin zone entries
 * (`GET /api/manual-zone/resolve`). NEVER throws — every failure is a typed refusal (three honesty
 * properties in the file header). Skips the network call entirely when `deps.authToken` is absent.
 *
 * @param point  the parcel query point (WGS84).
 * @param deps   injectable fetch + auth token (production supplies both from the real session).
 */
export async function resolveCordobaManualAdminZone(
    point: CordobaManualAdminZoneLngLat | null | undefined,
    deps: CordobaManualAdminZoneDeps = {},
): Promise<CordobaManualAdminZoneResult> {
    const span = tracer.startSpan('pryzm.zoning.resolveCordobaManualAdminZone');
    span.setAttribute('provider', 'cordoba-manual-admin-zone');
    try {
        if (
            !point ||
            typeof point.lat !== 'number' ||
            typeof point.lon !== 'number' ||
            !Number.isFinite(point.lat) ||
            !Number.isFinite(point.lon)
        ) {
            span.setAttribute('resultFields', 'no-point');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-point' };
        }
        if (!isInCordobaMunicipality(point.lat, point.lon)) {
            span.setAttribute('resultFields', 'out-of-cordoba');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-cordoba' };
        }
        if (!deps.authToken) {
            // No known session — never call the network (see file header §WHY).
            span.setAttribute('resultFields', 'not-authenticated');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'not-authenticated' };
        }

        const fetchImpl = deps.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
        if (!fetchImpl) {
            span.setAttribute('resultFields', 'data-unavailable');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'data-unavailable' };
        }

        const base = deps.baseUrl ?? '';
        const url =
            `${base}/api/manual-zone/resolve?jurisdiction=es-cordoba` +
            `&lat=${encodeURIComponent(String(point.lat))}&lon=${encodeURIComponent(String(point.lon))}`;

        let res: Response;
        try {
            res = await fetchImpl(url, {
                headers: { Authorization: `Bearer ${deps.authToken}` },
            });
        } catch (err) {
            console.warn('[cordoba-manual-admin-zone] fetch failed (non-fatal):', (err as Error)?.message ?? err);
            span.setAttribute('resultFields', 'data-unavailable');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'data-unavailable' };
        }

        if (res.status === 403) {
            span.setAttribute('resultFields', 'forbidden');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'forbidden' };
        }
        if (!res.ok) {
            span.setAttribute('resultFields', 'data-unavailable');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'data-unavailable' };
        }

        let body: unknown;
        try {
            body = await res.json();
        } catch (err) {
            console.warn('[cordoba-manual-admin-zone] malformed response (non-fatal):', (err as Error)?.message ?? err);
            span.setAttribute('resultFields', 'data-unavailable');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'data-unavailable' };
        }

        const parsed = body as {
            ok?: boolean;
            reason?: string;
            entry?: {
                zoneCode?: string;
                subzoneCode?: string | null;
                payload?: Record<string, unknown>;
                enteredByEmail?: string;
                enteredAt?: string;
                notes?: string | null;
            };
        };

        if (!parsed || parsed.ok !== true || !parsed.entry || typeof parsed.entry.zoneCode !== 'string') {
            const reason: CordobaManualAdminZoneRefusalReason =
                parsed?.reason === 'forbidden' ? 'forbidden' : 'no-match';
            span.setAttribute('resultFields', reason);
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason };
        }

        const entry = parsed.entry;
        // §NEARBY-HEIGHT-SUGGESTION (2026-08-05) — honestly distinguish a saved entry that was a
        // real-height-based SUGGESTION the admin accepted WITHOUT changing it, from one the admin
        // typed/picked themselves. ⚠ NEVER read as "PRYZM determined this zone" — always a heuristic
        // hint the admin reviewed by saving it as-is, never a verified zone reading.
        const payload = (entry.payload ?? {}) as Record<string, unknown>;
        const suggestedFromHeights = payload['suggestedFromHeights'] === true;
        const suggestionNote = suggestedFromHeights
            ? ' ⚠ This zone was a SUGGESTION from real nearby OSM building heights ' +
              `(median ${String(payload['suggestionMedianHeightM'] ?? 'n/a')} m over ` +
              `${String(payload['suggestionSampleCount'] ?? 'n/a')} real footprints) that the admin ` +
              'accepted WITHOUT changing it — a heuristic hint, not a verified zone determination.'
            : '';
        const provenance =
            `Manual admin entry by ${entry.enteredByEmail ?? 'unknown admin'} at ${entry.enteredAt ?? 'unknown time'} ` +
            "— a bare zone-code entry with NO geometry trace, distinct from PRYZM's hand-traced " +
            "polygon readings (method: 'manual_admin_entry'). Live only for the entering admin's own session." +
            suggestionNote;

        const zoneCode: string = entry.zoneCode as string;
        span.setAttribute('resultFields', 'ok');
        span.setAttribute('zoneCode', zoneCode);
        span.setStatus({ code: SpanStatusCode.OK });
        return {
            ok: true,
            resolution: {
                zoneCode,
                subzoneCode: entry.subzoneCode ?? null,
                payload: entry.payload ?? {},
                enteredByEmail: entry.enteredByEmail ?? '',
                enteredAt: entry.enteredAt ?? '',
                notes: entry.notes ?? null,
                provenance,
            },
        };
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[cordoba-manual-admin-zone] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'data-unavailable' };
    } finally {
        span.end();
    }
}
