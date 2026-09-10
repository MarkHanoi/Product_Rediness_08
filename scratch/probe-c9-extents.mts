// TEMP measurement probe (lane C9) — NOT part of the product. Prints the REAL per-layer extents,
// tile fan-out and zoom for the founder's Barcelona run, straight out of the shipped modules.
import {
    groundFetchHalfDeg, treesFetchHalfDeg, farFetchHalfDeg, scopeReadFanOutCap,
    CTX_BUILDINGS_MAX_TILES_PER_FETCH, CTX_MAX_CACHED_TILES,
} from '../apps/editor/src/ui/geospatial/contextExtentBudget';
import { CONTEXT_WIDE_HALF_DEG, CONTEXT_SEA_HALF_DEG } from '../apps/editor/src/ui/geospatial/contextExtents';
import { CONTEXT_BBOX_HALF_DEG, CONTEXT_BBOX_FAR_HALF_DEG } from '../apps/editor/src/ui/geospatial/contextBuildings';
import { scopeReadCompleteCeilingM } from '../apps/editor/src/ui/geospatial/scopeReadCeiling';
import { tilesCovering, zoomForExtent, tileFanOutCap, MAX_TILES_PER_FETCH, tileCountCovering } from '../apps/editor/src/ui/geospatial/contextTiles';

const LAT = 41.3874, LON = 2.1686;
const ceil = scopeReadCompleteCeilingM(LAT, LON);
const ground = groundFetchHalfDeg();
const trees = treesFetchHalfDeg(undefined, ceil.radiusM);
console.log('scopeReadCompleteCeilingM =', JSON.stringify(ceil));
console.log('CONTEXT_BBOX_HALF_DEG (near) =', CONTEXT_BBOX_HALF_DEG);
console.log('CONTEXT_BBOX_FAR_HALF_DEG    =', CONTEXT_BBOX_FAR_HALF_DEG);
console.log('farFetchHalfDeg()            =', farFetchHalfDeg());
console.log('groundFetchHalfDeg()         =', ground);
console.log('treesFetchHalfDeg()          =', trees);
console.log('CONTEXT_WIDE_HALF_DEG        =', CONTEXT_WIDE_HALF_DEG);
console.log('CONTEXT_SEA_HALF_DEG         =', CONTEXT_SEA_HALF_DEG);
console.log('caps: default', MAX_TILES_PER_FETCH, 'buildings', CTX_BUILDINGS_MAX_TILES_PER_FETCH, 'tileCache', CTX_MAX_CACHED_TILES);
console.log('scopeReadFanOutCap(ground)   =', scopeReadFanOutCap(ground));
console.log('scopeReadFanOutCap(trees,points) =', scopeReadFanOutCap(trees, undefined, undefined, 'points'));

const rows: Array<[string, number, number, number]> = [
    // layer, halfDeg, archive maxZoom(assumed 16 / sea 14), cap
    ['buildings(near)', CONTEXT_BBOX_HALF_DEG, 16, CTX_BUILDINGS_MAX_TILES_PER_FETCH],
    ['buildings(far)', farFetchHalfDeg(), 16, CTX_BUILDINGS_MAX_TILES_PER_FETCH],
    ['roads', ground, 16, scopeReadFanOutCap(ground) ?? tileFanOutCap('roads')],
    ['parks', ground, 16, scopeReadFanOutCap(ground) ?? tileFanOutCap('parks')],
    ['rail', ground, 16, scopeReadFanOutCap(ground) ?? tileFanOutCap('rail')],
    ['trees', trees, 16, scopeReadFanOutCap(trees, undefined, undefined, 'points') ?? tileFanOutCap('trees')],
    ['water', CONTEXT_BBOX_HALF_DEG, 16, tileFanOutCap('water')],
    ['water(sea-extent)', CONTEXT_SEA_HALF_DEG, 16, tileFanOutCap('water')],
    ['sea', CONTEXT_SEA_HALF_DEG, 14, tileFanOutCap('sea')],
    ['landuse', CONTEXT_WIDE_HALF_DEG, 16, tileFanOutCap('landuse')],
];
console.log('\nlayer                 halfDeg     z   tiles  cap');
const tileSets: Record<string, string[]> = {};
for (const [name, h, maxz, cap] of rows) {
    const bbox = [LON - h, LAT - h, LON + h, LAT + h] as const;
    const z = zoomForExtent(bbox, maxz, 12, cap);
    const tiles = tilesCovering(bbox, z);
    tileSets[name] = tiles.map((t) => `${z}/${t.x}/${t.y}`);
    console.log(`${name.padEnd(20)} ${h.toFixed(5).padStart(8)}  ${String(z).padStart(2)}  ${String(tiles.length).padStart(5)}  ${cap}  (count@z16=${tileCountCovering(bbox, 16)})`);
}
// Cross-layer tile-address overlap
const names = Object.keys(tileSets);
console.log('\nSHARED TILE ADDRESSES (same z/x/y across layers — different ARCHIVES, so different bytes):');
for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
        const a = new Set(tileSets[names[i]!]!), b = tileSets[names[j]!]!;
        const shared = b.filter((k) => a.has(k)).length;
        if (shared > 0) console.log(`  ${names[i]!.padEnd(20)} ∩ ${names[j]!.padEnd(20)} = ${shared} / ${a.size} vs ${b.length}`);
    }
}
