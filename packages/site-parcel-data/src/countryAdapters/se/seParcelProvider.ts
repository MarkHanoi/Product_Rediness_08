// LANE E7-SE — SWEDEN (SE) · the parcel arm. E7-family conventions §6.A
// (`<cc>ParcelProvider.ts`: `resolve<Cc>ParcelBy<NationalId>` + `resolve<Cc>ParcelAtWgs84Point`,
// both → `Promise<FetchOutcome<…>>`).
//
// ⛔ BOTH RESOLVERS ARE DECLARED DEFERRALS. Lantmäteriet's Fastighetsindelning is the national
// cadastre; it became an open HVD dataset (CC BY 4.0) in early 2025, and the DATA is not the
// problem. The gate is client registration — measured 2026-09-01:
//   `…/sokning/v1/fastighetsindelning/v1/search` → HTTP 401 `900902 Missing Credentials`.
// See `seNgpGate.ts` for the full measurement and the C74 §3.4 scaffold record.
//
// WHY THE SIGNATURES EXIST AT ALL, given there is no client behind them: so that the SHAPE of the
// Swedish parcel leg is stated in the same words as EE/DK/LT/PL — a future lane fills these two
// functions in and changes nothing else — and so that the refusal is reachable through the
// adapter's own surface rather than being a sentence in a report. C74 §3.8's "declare the unwired
// in the barrel" is honoured by `index.ts`'s explicit deferral list.
//
// ⛔ NOT REGISTERED IN `parcelProviders/registry.ts`. Two independent reasons, either sufficient:
//   (1) L-12871 is OPEN and SWEDEN_BBOX overlaps FIVE registered boxes (seJurisdiction.ts's
//       measured audit) — a smallest-box resolver would hand København to Sweden on area alone;
//   (2) there is nothing behind the route to call. Registering a row that always refuses would
//       make the registry claim coverage the adapter does not have.
// The one-line registration is written to impl/barrel-additions-se.txt with the overlap audit
// attached, for the orchestrator, after L-12871 has precedence data.
//
// ⚠ NO `fastighetsbeteckning` PARSER IS SHIPPED. The Swedish national parcel id is a
// `<kommun> <trakt> <block>:<enhet>` designation (e.g. `Stockholm Vasastaden 1:1`), and writing a
// parser for it against the published grammar — with no served bytes to test it on — would be
// exactly the [[fake-more-capable-than-real]] failure: a parser built from the spec cannot
// falsify the spec. The id travels as an opaque string until real responses exist.

import type { FetchOutcome } from '@pryzm/schemas';
import { SE_NGP_GATED_ENDPOINTS, seNgpDeferredRefusal } from './seNgpGate.js';

/** Provider/provenance id, reserved so the registry row and the refusals cannot drift apart. */
export const SE_PARCEL_PROVIDER_ID = 'se-lantmateriet-fastighetsindelning';
export const SE_PARCEL_PROVIDER_LABEL = 'Fastighet (Sweden · Lantmäteriet fastighetsindelning)';

/**
 * A resolved Swedish cadastral parcel. Declared, never constructed by this lane — the shape is
 * the seat a future lane fills from RECORDED BYTES.
 */
export interface SeCadastralParcel {
    /** `fastighetsbeteckning`, opaque (see the header on why it is not parsed). */
    readonly designation: string;
    /** Lantmäteriet's `objektidentitet` UUID, or null. */
    readonly objectId: string | null;
    /** Outer ring in the CRS named by `crs` — [easting, northing] exactly as served. */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    /** CRS of `ring` — SWEREF 99 TM for national Swedish geodata. */
    readonly crs: string;
    readonly provider: string;
    /** → `SiteIntelSource.id`. */
    readonly source: string;
}

/**
 * Resolve a parcel by its `fastighetsbeteckning`. **DEFERRED** — returns the self-announcing
 * credential-gate refusal (C74 §3.2), never a fabricated parcel and never an `absent`.
 */
export async function resolveSeParcelByDesignation(
    designation: string,
): Promise<FetchOutcome<SeCadastralParcel>> {
    return seNgpDeferredRefusal<SeCadastralParcel>(
        `cadastre parcel lookup (fastighetsbeteckning "${designation}")`,
        SE_NGP_GATED_ENDPOINTS.fastighetsindelningSearch,
    );
}

/**
 * Resolve the parcel at a WGS84 point (the registry click path). **DEFERRED** — same refusal.
 * The point is echoed into the reason so a caller can tell WHICH request was refused.
 */
export async function resolveSeParcelAtWgs84Point(
    lat: number,
    lon: number,
): Promise<FetchOutcome<SeCadastralParcel>> {
    return seNgpDeferredRefusal<SeCadastralParcel>(
        `cadastre parcel at ${lat.toFixed(6)},${lon.toFixed(6)}`,
        SE_NGP_GATED_ENDPOINTS.fastighetsindelningSearch,
    );
}
