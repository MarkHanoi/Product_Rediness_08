// L-380 P0 / L-613 — Parcel Data Layer barrel.
//
// The provider-agnostic interface + the per-jurisdiction adapters. `defaultParcelProvider` is what
// the map UI consumes; as of L-613 it is the ROUTING REGISTRY (not a single hard-coded cadastre),
// so the map's "Select parcel" click resolves the right national cadastre where one is open
// (Spain/France/Netherlands/Norway/NRW) and an honest OSM footprint everywhere else.

export type { ParcelFeature, ParcelProvider } from './ParcelProvider.js';
// §L-1581 (C06 §13.3) — THE ONE parcel-card producer + the fetched→persisted adapter.
export {
    buildParcelCard,
    parcelFeatureToProvenance,
    parcelFeatureToCardModel,
    parcelProvenanceToCardModel,
    isCadastralCardModel,
    PARCEL_CARD_TESTID,
    PARCEL_CARD_ABSENT_TESTID,
    PARCEL_FOOTPRINT_WARNING,
    PARCEL_USER_DRAWN_NOTE,
    PARCEL_AREA_DERIVED_NOTE,
    PARCEL_PROVENANCE_ABSENT_TEXT,
    PARCEL_NO_BOUNDARY_TEXT,
    type ParcelCardModel,
    type ParcelCardAction,
    type ParcelCardOptions,
    type ParcelCardLeadNote,
} from './parcelCard.js';
// §L-12912 (lane PT-BELVERDE-LOTS) — when the cadastre's answer is a holding and an OSM footprint
// exists under the click, the footprint is the primary candidate; the holding stays one click away.
export {
    chooseParcelCandidate,
    isFootprintCandidate,
    PARCEL_FOOTPRINT_CANDIDATE_TITLE,
    PARCEL_CANDIDATE_WHY_TESTID,
    PARCEL_USE_HOLDING_TESTID,
    type ParcelCandidateChoice,
    type ParcelPrimaryCandidate,
} from './parcelCandidateChoice.js';
// §L-1582 — the GIS rail-panel host for that card.
export {
    mountParcelSection,
    buildParcelSectionBody,
    GIS_PARCEL_SLOT_TESTID,
    type ParcelSectionHandle,
} from './parcelPanelSection.js';
export { catastroParcelProvider, parseProxyResponse, CATASTRO_PARCEL_ENDPOINT } from './CatastroParcelProvider.js';
export { makeWfsParcelProvider, parseWfsProxyResponse } from './WfsParcelProvider.js';
export { dkMatrikelParcelProvider, DK_MATRIKEL_PARCEL_ENDPOINT } from './DkMatrikelParcelProvider.js';
export { footprintParcelProvider, pickFootprintAtPoint } from './FootprintParcelProvider.js';
export {
    registryParcelProvider,
    resolveParcelProvider,
    resolveParcelAttribution,
    cadastralProviderFor,
    PARCEL_FOOTPRINT_ATTRIBUTION,
} from './parcelRegistry.js';
// §L-12912 — the data-justified size review beside the match tier (Belverde 766 ha prédio).
export {
    assessParcelSize,
    parcelSizeReviewText,
    URBAN_PARCEL_AREA_CEILING_M2,
    PARCEL_SIZE_CORPUS,
    PARCEL_SIZE_CORPUS_AREAS_M2,
    PARCEL_SIZE_REVIEW_TESTID,
    type ParcelSizeReview,
    type ParcelSizeStatus,
} from './parcelSizeReview.js';

import type { ParcelProvider } from './ParcelProvider.js';
import { registryParcelProvider } from './parcelRegistry.js';

/**
 * The active parcel provider for the map's "Select parcel" mode. L-613: this is now the
 * per-jurisdiction REGISTRY — a click routes to Catastro (ES) / IGN (FR) / PDOK (NL) / Kartverket
 * (NO) / ALKIS-NRW (DE-NW) where reachable, and to the honest OSM footprint fallback everywhere
 * else. Adding a country is a data addition in `@pryzm/site-parcel-data`, not an edit here.
 */
export const defaultParcelProvider: ParcelProvider = registryParcelProvider;
