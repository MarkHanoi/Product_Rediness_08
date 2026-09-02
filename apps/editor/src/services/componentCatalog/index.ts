// apps/editor/src/services/componentCatalog — lane U0's public surface.
// See `ComponentCatalog.ts` for the doctrine (one loader wrapped, one resolver
// shared with the handlers + the 4E bake seam, honest empty state, provenance,
// and the OPEN project-persistence question).

export {
  ComponentCatalog,
  componentCatalog,
  type ComponentCatalogEntry,
  type ComponentCatalogLoadResult,
  type ComponentCatalogOptions,
  type MarketplaceFamilyRow,
  type MarketplaceListResult,
  type CatalogFetch,
  type FileLike,
} from './ComponentCatalog.js';
