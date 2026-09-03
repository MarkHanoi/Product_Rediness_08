// LANE ME-GULF — GULF (GCC) · the parcel arm. E7-family conventions §6.A
// (`resolve…ParcelAtWgs84Point → Promise<FetchOutcome<…>>`), but ONE resolver parameterised by
// regionCode (the AU-lane "one client parameterised by regionCode — DRY without hiding per-region
// provenance" shape), because every Gulf parcel channel is a DECLARED DEFERRAL of identical shape.
//
// ⛔ EVERY RESOLUTION IS A DECLARED DEFERRAL. There is no URL builder and no response parser here —
// none of the six probed channels served a keyless parcel (gulfDeferrals.ts carries the per-
// jurisdiction gate transcript). The per-jurisdiction provenance is NOT hidden by the shared
// resolver: the refusal names the exact gate, endpoints and retirement condition of the regionCode
// it was called with. A future lane that unlocks one jurisdiction (e.g. an in-UAE proxy for Dubai
// Pulse, or a Balady-SSO token for Saudi) replaces THAT descriptor's branch and changes nothing else.

import type { FetchOutcome } from '@pryzm/schemas';
import { GULF_DEFERRALS, gulfDeferredRefusal } from './gulfDeferrals.js';

/** Provider/provenance id, reserved so the registry rows and the deferrals cannot drift apart. */
export const GULF_PARCEL_PROVIDER_ID = 'footprint';

/**
 * A resolved Gulf cadastral parcel. DECLARED, never constructed by this lane — the seat a future
 * lane fills from RECORDED BYTES once a jurisdiction's gate is cleared. Kept opaque on purpose
 * ([[fake-more-capable-than-real]]): no national-id parser is shipped against a grammar nobody has
 * fetched bytes for.
 */
export interface GulfCadastralParcel {
    /** The national/emirate parcel identifier, opaque until real responses exist. */
    readonly parcelId: string;
    /** Outer ring in the CRS named by `crs` — exactly as served (never a fabricated ring). */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    readonly crs: string;
    readonly regionCode: string;
    readonly provider: string;
}

/** The registry regionCodes this adapter answers for (each has a `GULF_DEFERRALS` descriptor). */
export const GULF_PARCEL_REGION_CODES = ['AE-DU', 'AE-AZ', 'SA', 'KW', 'BH', 'OM'] as const;
export type GulfParcelRegionCode = (typeof GULF_PARCEL_REGION_CODES)[number];

/**
 * Resolve the parcel at a WGS84 point for a Gulf jurisdiction (the registry click path). **DEFERRED**
 * — returns the self-announcing gate refusal for `regionCode` (never a fabricated parcel, never an
 * `absent`). The point is echoed into the leg so a caller can tell WHICH request was refused. NEVER
 * throws. `regionCode` accepts the emirate codes `AE-DU`/`AE-AZ` as well as the country codes; an
 * unregistered code still refuses honestly (naming that no deferral is registered).
 */
export async function resolveGulfParcelAtWgs84Point(
    regionCode: string,
    lat: number,
    lon: number,
): Promise<FetchOutcome<GulfCadastralParcel>> {
    const leg = `cadastre parcel at ${lat.toFixed(6)},${lon.toFixed(6)}`;
    return gulfDeferredRefusal<GulfCadastralParcel>(regionCode, leg);
}

/**
 * Resolve a parcel by its national/emirate identifier. **DEFERRED** — same refusal. Exists so the
 * SHAPE of the Gulf parcel leg is stated in the same words as EE/DK/SE, and the refusal is reachable
 * through the adapter's own surface rather than being only a sentence in a report (C74 §3.8).
 */
export async function resolveGulfParcelById(
    regionCode: string,
    parcelId: string,
): Promise<FetchOutcome<GulfCadastralParcel>> {
    return gulfDeferredRefusal<GulfCadastralParcel>(regionCode, `parcel lookup (id "${parcelId}")`);
}

/** True when this adapter has a declared deferral for `regionCode`. Pure. */
export function isGulfDeferredRegion(regionCode: string): boolean {
    return Object.prototype.hasOwnProperty.call(GULF_DEFERRALS, regionCode);
}
