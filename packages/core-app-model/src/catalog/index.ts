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
