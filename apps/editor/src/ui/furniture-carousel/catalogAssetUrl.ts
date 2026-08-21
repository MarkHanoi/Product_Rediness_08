// ─────────────────────────────────────────────────────────────────────────────
// catalogAssetUrl.ts — RE-EXPORT SHIM. The implementation moved DOWN to L2.
//
// §FURNITURE-GLB-404-SUMMARY / L-570 built this here, at L7. §MATERIAL-MAPS-AND-TILING
// (L-1701) needs the SAME seam from `MaterialResolver` at L2 — C100 §10.6 records
// that the furniture GLB 404s and the texture-hosting question are literally the
// same unbuilt bucket, so a second asset-URL path would be a second answer to one
// question (C84 EI-8) that diverges the moment either bucket moves again. An L2
// package cannot import from L7, so the ONE implementation moved to
// `packages/core-app-model/src/catalog/catalogAssetUrl.ts`.
//
// This file stays so the four editor call sites and the L-570 test keep their
// original specifier. It adds NO behaviour: one implementation, one env read.
// ─────────────────────────────────────────────────────────────────────────────

export {
    isCatalogRehosted,
    catalogBaseUrl,
    resolveCatalogAssetUrl,
} from '@pryzm/core-app-model/catalog';
