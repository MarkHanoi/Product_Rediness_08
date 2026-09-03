// LANE RO — ROMANIA (RO) · the parcel arm. Sibling shape to EE/DK/LT/PL/SE
// (`resolve<Cc>ParcelBy<NationalId>` + `resolve<Cc>ParcelAtWgs84Point`, both →
// `Promise<FetchOutcome<…>>`).
//
// ⛔ BOTH RESOLVERS ARE DECLARED DEFERRALS (GATE 1 — the ANCPI host does not resolve; see
// roAncpiGate.ts). The national cadastre is ANCPI's INSPIRE Cadastral Parcel layer, served as
// GeoJSON by an ArcGIS Server estate keyed on `INSPIRE_ID`. The DATA is not the problem — the
// geoportal.ancpi.ro host returns NXDOMAIN from every resolver available to this build (measured
// 2026-09-02 and 2026-09-03), so there are NO SERVED BYTES.
//
// WHY THE SIGNATURES EXIST AT ALL, given there is no client behind them: so that the SHAPE of the
// Romanian parcel leg is stated in the same words as EE/DK/LT/PL/SE — a future lane fills these two
// functions in and changes nothing else — and so that the refusal is reachable through the
// adapter's own surface rather than being a sentence in a report ([[committed-is-not-reachable]]).
//
// ⚠ NO ArcGIS/GeoJSON PARSER IS SHIPPED. Romania's national parcel id is the `INSPIRE_ID`
// designation (`RO.<county>.<uat>.<parcel>`, e.g. `RO.83.40991.102507`), and the parcel geometry
// comes back as an Esri/GeoJSON ring in the layer's CRS. Writing a parser for either against the
// community-wrapper documentation — with no served bytes to test it on — would be exactly the
// [[fake-more-capable-than-real]] failure: a parser built from the spec cannot falsify the spec.
// The id travels as an OPAQUE string until real responses exist; `RoCadastralParcel` is the SEAT a
// future lane fills from RECORDED BYTES, not a shape this lane constructs.

import type { FetchOutcome } from '@pryzm/schemas';
import { RO_ANCPI_ENDPOINTS, roAncpiDeferredRefusal } from './roAncpiGate.js';

/** Provider/provenance id, reserved so the registry row and the deferred adapter cannot drift apart. */
export const RO_PARCEL_PROVIDER_ID = 'ancpi-eterra3';
export const RO_PARCEL_PROVIDER_LABEL =
    'Imobil (Romania · ANCPI geoportal · INSPIRE Cadastral Parcel)';

/**
 * A resolved Romanian cadastral parcel. Declared, never constructed by this lane — the shape is
 * the seat a future lane fills from RECORDED BYTES once GATE 1 clears.
 */
export interface RoCadastralParcel {
    /** `INSPIRE_ID`, opaque (see the header on why it is not parsed), e.g. `RO.83.40991.102507`. */
    readonly inspireId: string;
    /** ANCPI internal identifier where served, or null. */
    readonly nationalCadastralReference: string | null;
    /** Outer ring in the CRS named by `crs` — [x, y] exactly as served, never reprojected here. */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    /** CRS of `ring` — EPSG:4326 when `outSR=4326` is requested; else the layer's native CRS. */
    readonly crs: string;
    readonly provider: string;
    /** → `SiteIntelSource.id`. */
    readonly source: string;
}

/**
 * Resolve a parcel by its `INSPIRE_ID`. **DEFERRED** — returns the self-announcing service-gate
 * refusal (C74 §3.2), never a fabricated parcel and never an `absent`. The id is echoed into the
 * reason so a caller can tell WHICH request was refused.
 */
export async function resolveRoParcelByInspireId(
    inspireId: string,
): Promise<FetchOutcome<RoCadastralParcel>> {
    return roAncpiDeferredRefusal<RoCadastralParcel>(
        `cadastre parcel lookup (INSPIRE_ID "${inspireId}")`,
        RO_ANCPI_ENDPOINTS.eterra3Parcels,
    );
}

/**
 * Resolve the parcel at a WGS84 point (the registry click path). **DEFERRED** — same refusal. The
 * point is echoed into the reason so a caller can tell WHICH request was refused.
 */
export async function resolveRoParcelAtWgs84Point(
    lat: number,
    lon: number,
): Promise<FetchOutcome<RoCadastralParcel>> {
    return roAncpiDeferredRefusal<RoCadastralParcel>(
        `cadastre parcel at ${lat.toFixed(6)},${lon.toFixed(6)}`,
        RO_ANCPI_ENDPOINTS.eterra3Parcels,
    );
}
