// L-449 (Denmark, deferred-data half) — the Denmark (Matriklen) parcel provider on the CANONICAL
// parcel-provider interface, as a DEFERRED STUB.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// WHY A STUB, AND WHY THAT IS THE HONEST ANSWER (founder ruling 2026-07-30)
// ═════════════════════════════════════════════════════════════════════════════════════════════
// Denmark is now "OFFLINE LEGISLATION + DEFERRED LIVE DATA", the same shape as Sweden. The signed
// L-449 legislation half (the Plandata → buildable-envelope mapping in `dkPlandataEnvelope.ts`) is
// complete and needs NO live data. The DATA half — the Matriklen cadastre behind Datafordeler — is
// BLOCKED, not by code but by an ACCESS gate: bootstrapping a Datafordeler administrator account
// requires a Danish MitID identity, exactly the class of blocker that stops the Swedish BankID path.
// PRYZM cannot obtain the credential, so there will be no live Datafordeler/PLANDATA parcel access.
//
// The honest response is NOT to attempt a live fetch that will always fail, nor to fabricate a
// parcel. It is a provider that:
//   • conforms to the canonical parcel-provider shape (id, label, proxyPath, fetchParcelAtPoint);
//   • NEVER attempts live access and NEVER throws;
//   • returns `null`, so the parcel registry falls back to the OSM building footprint (graceful,
//     Spain-parity "click to select", honestly labelled as a footprint — never as a legal parcel);
//   • carries a SINGLE swap-in seam (`// DEFERRED:` below): the day a Datafordeler admin bootstrap
//     exists, ONLY this one method body is filled in — no change to the buildability engine, the
//     rule pack, or the canonical model. The rule pack (offline legislation) and the parcel provider
//     (deferred data) are SEPARATE concerns and stay separate.
//
// PURE + never-throws. The ONLY runtime surface is the OTel span (default no-op tracer, no I/O).
// Strategic context — L-449, C57, C58 §1.4/§1.5, the SE (BankID-blocked) precedent,
// docs/04-reference/jurisdictions/dk/RATE-IMPLEMENTATION-PLAN.md (Parcel = access-deferred).

import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.parcel.dk');

/** A WGS84 vertex (lon, lat). */
export interface LonLat {
    readonly lon: number;
    readonly lat: number;
}

/**
 * A fetched cadastral parcel — PACKAGE-LOCAL (there is no shared parcel schema at this layer yet;
 * the editor's `ParcelFeature` is an L5 type). Normalised to a WGS84 lon/lat ring. The live
 * Datafordeler adapter parses Matriklen `mat:Jordstykke` into exactly this shape.
 */
export interface CadastralParcel {
    /** Outer boundary ring, WGS84 lon/lat (not necessarily closed). */
    readonly ring: ReadonlyArray<LonLat>;
    /** The Matriklen parcel identifier (matrikelnummer / SFE number). */
    readonly parcelId: string;
    /** Parcel area (m²) from the source registry when available, else null. */
    readonly areaM2: number | null;
    /** Provenance tag — which provider produced this. */
    readonly source: string;
}

/** A minimal injectable HTTP fetch (never called by the stub; wired for the live adapter so it is
 *  testable without a global `fetch` and never reaches a real network in a unit test). */
export interface ParcelHttpResponse {
    readonly ok: boolean;
    readonly status: number;
    json(): Promise<unknown>;
}
export type ParcelHttpFetch = (
    url: string,
    init?: { readonly signal?: unknown },
) => Promise<ParcelHttpResponse>;

/** Injectable dependencies for the provider (the swap-in point for the live adapter). */
export interface DkMatrikelProviderDeps {
    /** The HTTP fetch the LIVE adapter will use. Absent for the stub (it never fetches). */
    readonly fetchImpl?: ParcelHttpFetch;
}

/** Stable provider id / provenance tag. */
export const DK_MATRIKEL_PROVIDER_ID = 'matrikel-dk';
/** Human-facing source label for the parcel info card / attribution. */
export const DK_MATRIKEL_PROVIDER_LABEL = 'Matriklen (Denmark)';
/** The same-origin proxy route the LIVE adapter would call (unused by the stub). */
export const DK_MATRIKEL_PARCEL_PROXY_PATH = '/api/parcel/dk';

/**
 * Resolve the real cadastral parcel at a WGS84 point — DEFERRED STUB.
 *
 * Returns `null` unconditionally (no live access attempted). NEVER throws. Emits one OTel span so
 * the deferral is observable in traces. The `deps` param is accepted (and threaded) so the live
 * adapter is a drop-in body change with no signature churn.
 */
export async function fetchParcelAtPoint(
    lon: number,
    lat: number,
    deps: DkMatrikelProviderDeps = {},
): Promise<CadastralParcel | null> {
    const span = tracer.startSpan('pryzm.parcel.dk.fetchParcelAtPoint');
    try {
        span.setAttribute('lon', lon);
        span.setAttribute('lat', lat);
        span.setAttribute('proxyPath', DK_MATRIKEL_PARCEL_PROXY_PATH);
        span.setAttribute('deferred', true);

        // DEFERRED: wire Datafordeler Matrikel here once admin bootstrap exists.
        // Blocked by the Danish MitID identity gate (same class as Swedish BankID) — no Datafordeler
        // administrator/service-user credential can be provisioned, so there is no live access. To
        // ACTIVATE (and ONLY this body changes): with `deps.fetchImpl` set, call
        // `deps.fetchImpl(`${DK_MATRIKEL_PARCEL_PROXY_PATH}?lon=${lon}&lat=${lat}`)`, and on a 200
        // parse the Matriklen `mat:Jordstykke` feature (EPSG:25832 → WGS84) into a `CadastralParcel`.
        // Until then return null so the registry falls back to the OSM footprint (never a fabricated
        // parcel — C58 §1.4). `deps.fetchImpl` is referenced only to keep the seam honest + lint-clean.
        void deps.fetchImpl;

        span.setStatus({ code: SpanStatusCode.OK });
        return null;
    } catch (err) {
        // Never throw — a miss falls back to manual draw / OSM footprint (canonical contract).
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        return null;
    } finally {
        span.end();
    }
}

/** The Denmark (Matriklen) parcel provider — canonical shape, deferred-stub behaviour. */
export const dkMatrikelParcelProvider = {
    id: DK_MATRIKEL_PROVIDER_ID,
    label: DK_MATRIKEL_PROVIDER_LABEL,
    proxyPath: DK_MATRIKEL_PARCEL_PROXY_PATH,
    /** DEFERRED: returns null (OSM fallback) until Datafordeler admin bootstrap exists. */
    fetchParcelAtPoint,
} as const;
