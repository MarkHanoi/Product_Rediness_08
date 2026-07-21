// L-536 STAGE 3 — how often does deriveProjectNorthAngleFromParcel return EXACTLY 0
// on real Barcelona cadastral parcels? That is the branch `dispatchParcelBoundary`
// uses to skip BOTH the de-rotation AND the θ write, so on that branch a STALE
// non-zero SiteLocation.trueNorth from a previously selected parcel survives.
import { buildParcelBboxUrl, parseParcelCollectionGml } from '../server/parcelZoningProxy.js';
import { buildBoundaryFromLatLonRing } from '../apps/editor/src/ui/site/boundaryProjection.js';
import { deriveProjectNorthAngleFromParcel } from '../apps/editor/src/ui/site/overlay/projectTrueNorth.js';

const AREAS = [
  { n: 'BCN Eixample', lat: 41.38885, lon: 2.16385 },
  { n: 'BCN Eixample E', lat: 41.3915, lon: 2.1660 },
  { n: 'BCN Gotic',     lat: 41.3810, lon: 2.1740 },
];
let total = 0, exactZero = 0, nearZero = 0;
const zeroAreas: number[] = [];
for (const a of AREAS) {
  const gml = await (await fetch(buildParcelBboxUrl(a.lat, a.lon, 0.002))).text();
  const parcels = parseParcelCollectionGml(gml);
  let z = 0;
  for (const p of parcels) {
    const b = buildBoundaryFromLatLonRing(p.ring, p.ring[0].lat, p.ring[0].lon);
    const t = deriveProjectNorthAngleFromParcel(b.polygon);
    total++;
    if (t === 0) { exactZero++; z++; zeroAreas.push(p.areaM2 ?? 0); }
    if (Math.abs(t) < 0.5 / 57.29578) nearZero++;
  }
  console.log(`${a.n.padEnd(16)} ${parcels.length} parcels · θ===0 exactly: ${z}`);
}
console.log(`\nTOTAL ${total} parcels · θ === 0 EXACTLY: ${exactZero} (${(100*exactZero/total).toFixed(1)}%) · |θ|<0.5°: ${nearZero} (${(100*nearZero/total).toFixed(1)}%)`);
