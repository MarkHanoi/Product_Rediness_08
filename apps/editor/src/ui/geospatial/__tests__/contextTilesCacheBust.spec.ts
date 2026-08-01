// ─────────────────────────────────────────────────────────────────────────────
// §CONTEXT-CACHE-BUST (L-658) — the context tileset URL must carry a version stamp.
//
// WHY THIS TEST EXISTS. `<layer>.pmtiles` is PATH-STABLE: a re-bake overwrites the
// same R2 key, and the bake publishes it `Cache-Control: public, max-age=31536000,
// immutable`. A YEAR of immutable caching on a URL that never changes means a
// browser that read the old tileset once would NEVER see a re-bake. Terrain hit
// exactly this (§TERRAIN-CACHE-BUST, L-639) and an entire 590-region rollout
// rendered as byte-identical stale tiles because the new bytes were never fetched.
//
// This locks the stamp onto the archive URL so a future refactor cannot quietly
// drop it — which would make the next context re-bake invisible, and (worse) make
// a WORKING fix look like a failed one.
// ─────────────────────────────────────────────────────────────────────────────
import { afterEach, describe, expect, it } from 'vitest';

import {
    CONTEXT_TILESET_VERSION,
    contextTilesetUrl,
    __setContextTilesBaseUrl,
} from '../contextTiles';

afterEach(() => __setContextTilesBaseUrl(null));

describe('CONTEXT_TILESET_VERSION', () => {
    it('is a non-empty stamp safe to put in a query string', () => {
        expect(CONTEXT_TILESET_VERSION).toBeTruthy();
        // No characters that would need escaping — the stamp is concatenated, not encoded.
        expect(CONTEXT_TILESET_VERSION).toMatch(/^[A-Za-z0-9._-]+$/);
    });
});

describe('contextTilesetUrl', () => {
    it('stamps the version onto the archive URL', () => {
        __setContextTilesBaseUrl('https://tiles.example/tiles/');
        expect(contextTilesetUrl('buildings')).toBe(
            `https://tiles.example/tiles/buildings.pmtiles?v=${CONTEXT_TILESET_VERSION}`,
        );
    });

    it('stamps every layer, not just buildings', () => {
        __setContextTilesBaseUrl('https://tiles.example/tiles/');
        for (const layer of ['buildings', 'roads', 'water', 'parks', 'landuse'] as const) {
            expect(contextTilesetUrl(layer)).toContain(`${layer}.pmtiles?v=${CONTEXT_TILESET_VERSION}`);
        }
    });

    it('stamps the same-origin proxy path too (the proxy ignores the query, the browser does not)', () => {
        __setContextTilesBaseUrl(null);
        const url = contextTilesetUrl('buildings');
        expect(url).toContain(`?v=${CONTEXT_TILESET_VERSION}`);
    });

    it('returns null when tiles are disabled, rather than a stamped-but-useless URL', () => {
        __setContextTilesBaseUrl('');
        expect(contextTilesetUrl('buildings')).toBeNull();
    });
});
