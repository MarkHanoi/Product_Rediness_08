/**
 * @pryzm/core-app-model — catalog sub-barrel (Wave 10 Task 2 W10-A)
 *
 * Sprint H P9 (2026-05-10): added AssetCatalogSchema + AssetCatalogStore.
 */

export type {
    AssetCategory,
    AssetCatalogParameters,
    AssetCatalogMetadata,
    AssetCatalogEntry,
    AssetCatalogParamUpdate,
} from './AssetCatalogTypes.js';

export {
    AssetCatalogEntryAddSchema,
    AssetCatalogEntryUpdateSchema,
    formatAssetCatalogZodError,
} from './AssetCatalogSchema.js';

export { AssetCatalogStore, assetCatalogStore } from './AssetCatalogStore.js';

export { buildDefaultAssetCatalog } from './assetCatalogDefaults.js';

// §FURNITURE-GLB-404-SUMMARY / L-570 — THE object-storage URL seam, moved here
// from apps/editor (L7) by L-1701 so `MaterialResolver` (L2) resolves texture map
// paths through the SAME seam the catalogue GLBs use. One implementation, one env
// read; apps/editor keeps a re-export shim at its original path.
export {
    isCatalogRehosted,
    catalogBaseUrl,
    resolveCatalogAssetUrl,
    CATALOG_LOGICAL_PREFIX,
} from './catalogAssetUrl.js';
