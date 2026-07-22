// L-585 PROBE, PART 3 — the FIRST gate a Madrid/Córdoba point meets in production.
// siteDispatch.ts:901-911 routes on isInDenmark() / isInBarcelona() and falls through to
// applyEstimatedZoning() otherwise. Nothing downstream (MUC clau, Catastro block, the
// dissolve, blockDerivedDepth, insetPolygonPerEdge) is reached at all for a non-gated point.
import { isInBarcelona, BARCELONA_BBOX } from '../packages/site-parcel-data/src/providers/barcelonaBbox.js';
const P: Array<[string, number, number]> = [
  ['BCN Eixample', 41.39073, 2.15803],
  ['MAD Salamanca', 40.4288, -3.6845],
  ['MAD Chamberi', 40.4382, -3.7014],
  ['MAD centro', 40.4155, -3.7074],
  ['COR centro', 37.8869, -4.778],
  ['COR ensanche', 37.8837, -4.774],
];
console.log('BARCELONA_BBOX =', JSON.stringify(BARCELONA_BBOX));
for (const [n, la, lo] of P) {
  const gated = isInBarcelona(la, lo);
  console.log(`${n.padEnd(15)} isInBarcelona=${String(gated).padEnd(5)} → ${gated ? 'MUC clau → block dissolve → Art.242.2 depth (insetPolygonPerEdge)' : 'applyEstimatedZoning — dissolve NEVER CALLED, L-581 code NEVER REACHED'}`);
}
