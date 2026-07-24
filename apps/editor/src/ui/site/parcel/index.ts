// L-380 P0 / L-613 — Parcel Data Layer barrel.
//
// The provider-agnostic interface + the per-jurisdiction adapters. `defaultParcelProvider` is what
// the map UI consumes; as of L-613 it is the ROUTING REGISTRY (not a single hard-coded cadastre),
// so the map's "Select parcel" click resolves the right national cadastre where one is open
// (Spain/France/Netherlands/Norway/NRW) and an honest OSM footprint everywhere else.

export type { ParcelFeature, ParcelProvider } from './ParcelProvider.js';
export { catastroParcelProvider, parseProxyResponse, CATASTRO_PARCEL_ENDPOINT } from './CatastroParcelProvider.js';
export { makeWfsParcelProvider, parseWfsProxyResponse } from './WfsParcelProvider.js';
export { dkMatrikelParcelProvider, DK_MATRIKEL_PARCEL_ENDPOINT } from './DkMatrikelParcelProvider.js';
export { footprintParcelProvider, pickFootprintAtPoint } from './FootprintParcelProvider.js';
export {
    registryParcelProvider,
    resolveParcelProvider,
    cadastralProviderFor,
} from './parcelRegistry.js';

import type { ParcelProvider } from './ParcelProvider.js';
import { registryParcelProvider } from './parcelRegistry.js';

/**
 * The active parcel provider for the map's "Select parcel" mode. L-613: this is now the
 * per-jurisdiction REGISTRY — a click routes to Catastro (ES) / IGN (FR) / PDOK (NL) / Kartverket
 * (NO) / ALKIS-NRW (DE-NW) where reachable, and to the honest OSM footprint fallback everywhere
 * else. Adding a country is a data addition in `@pryzm/site-parcel-data`, not an edit here.
 */
export const defaultParcelProvider: ParcelProvider = registryParcelProvider;
