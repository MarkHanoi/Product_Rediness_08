// L-380 P0 — Parcel Data Layer barrel. The provider-agnostic interface + the first
// (Spain / Catastro) adapter. `defaultParcelProvider` is what the map UI consumes;
// swapping the pilot jurisdiction later is a one-line change here.

export type { ParcelFeature, ParcelProvider } from './ParcelProvider.js';
export { catastroParcelProvider, parseProxyResponse, CATASTRO_PARCEL_ENDPOINT } from './CatastroParcelProvider.js';

import type { ParcelProvider } from './ParcelProvider.js';
import { catastroParcelProvider } from './CatastroParcelProvider.js';

/** The active parcel provider for the current pilot (Barcelona / Catastro). */
export const defaultParcelProvider: ParcelProvider = catastroParcelProvider;
