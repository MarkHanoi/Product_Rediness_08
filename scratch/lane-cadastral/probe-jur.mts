import { resolveParcelJurisdiction, resolveParcelCandidates } from '../../packages/site-parcel-data/src/index.js';
const pts: Array<[string, number, number]> = [
  ['ES Barcelona', 41.3874, 2.1686],
  ['ES Albox', 37.3894, -2.1447],
  ['ES Almeria', 36.8381, -2.4597],
  ['FR Paris', 48.8566, 2.3522],
  ['FR Lyon', 45.7640, 4.8357],
  ['NL Amsterdam', 52.3702, 4.8952],
  ['NL Rotterdam', 51.9244, 4.4777],
  ['DK Copenhagen', 55.6761, 12.5683],
  ['DK Aarhus', 56.1629, 10.2039],
];
for (const [name, lat, lon] of pts) {
  const j = resolveParcelJurisdiction(lat, lon);
  const c = resolveParcelCandidates(lat, lon);
  console.log(`${name.padEnd(16)} first=${j.regionCode}/${j.providerId}/${j.kind} proxy=${j.proxyPath}  candidates=[${c.map(x=>x.regionCode+':'+x.providerId+':'+x.kind).join(', ')}]`);
}
