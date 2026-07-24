// L-613 (Denmark slice) — the Denmark (Matriklen) adapter of the provider-agnostic Parcel Data
// Layer, a BYTE-FOR-BYTE behavioural clone of `CatastroParcelProvider`: same `ParcelProvider`
// interface, same `fetchParcelAtPoint(lon, lat) → ParcelFeature | null` signature, same return
// shape (a WGS84 ring + its cadastral ref), fetched through the SAME same-origin-proxy pattern
// (`/api/parcel/dk`, mirroring `/api/catastro/parcel`). From the map UI's perspective selecting a
// Copenhagen plot is INDISTINGUISHABLE from selecting a Barcelona plot — same click, same snap,
// same envelope hand-off — only the data endpoint (and the server-side credential) differs.
//
// The Danish Matrikel is credential-gated (a free Datafordeler service user, carried server-side
// by `server/dkMatrikelProxy.js`); when the credential is unset the proxy returns `{ parcel: null }`
// and the registry falls back to the OSM footprint. PURE (no THREE / Cesium / DOM); never throws.

import { makeWfsParcelProvider } from './WfsParcelProvider.js';
import type { ParcelProvider } from './ParcelProvider.js';

/** The same-origin proxy route (env-overridable, mirroring the Catastro endpoint constant). */
export const DK_MATRIKEL_PARCEL_ENDPOINT =
    (import.meta.env.VITE_DK_MATRIKEL_PARCEL_ENDPOINT as string | undefined) ?? '/api/parcel/dk';

/** The Denmark (Matriklen) parcel provider — the Catastro clone for Danish cadastral parcels. */
export const dkMatrikelParcelProvider: ParcelProvider = makeWfsParcelProvider({
    id: 'matrikel-dk',
    label: 'Matriklen (Denmark)',
    endpoint: DK_MATRIKEL_PARCEL_ENDPOINT,
});
