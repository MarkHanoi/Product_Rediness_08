// §SEPP-FIXTURES (round 3) — RAW identify bags at the points sepp-overlap2.mjs found: real LEP+SEPP
// stacks on Principal/14 (Parramatta North SSP; Hornsby/Eastern Harbour City), SEPP-only precincts
// (Growth Centres WPC; Gosford m(RL) cited), the SOP Reduced Level polygons, and the Growth
// Centres Incentive HOB. Same discipline as fixtures.mjs: keys exactly as served, never normalised.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { get, pool, HOST, SVC } from './probe.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../../../../../../../packages/site-parcel-data/__tests__/fixtures/nsw-sepp-2026-09-04.json');
const ov = JSON.parse(fs.readFileSync(path.resolve(HERE, '../sepp-overlap2.json'), 'utf8'));
const pick = (layer, objectid) => ov.q1[layer].rows.find((r) => r.objectid === objectid);
const rl = JSON.parse(fs.readFileSync(path.resolve(HERE, '../p14-sepp-census.json'), 'utf8')).rl718[0];
const POINTS = [
  { id: 'parramatta-north-ssp-stack', why: 'Principal/14 returns TWO polygons: Parramatta LEP 2023 20 m (cl 4.3) + SEPP (Precincts—Central River City) 2021 value 6, UNITS null. A real LEP+SEPP stack.', ...pick(134, 355647) },
  { id: 'hornsby-ehc-stack', why: 'Principal/14 returns Hornsby LEP 2013 8.5 m (cl 4.3) + SEPP (Precincts—Eastern Harbour City) 2021 9.5 m. A real LEP+SEPP stack, both in metres.', ...pick(614, 88482) },
  { id: 'growth-centres-wpc-sepp-only', why: 'Principal/14 returns ONE polygon, SEPP-drawn (Precincts—Western Parkland City), 9 m, uncited. No LEP HOB here.', ...pick(684, 88033) },
  { id: 'gosford-regional-mrl-cited', why: 'Principal/14 returns ONE SEPP-drawn polygon (Precincts—Regional), 55.7 m(RL), LEGIS_REF_CLAUSE "Clause 4.3" (pre-consolidation Gosford SEPP numbering; the consolidated instrument says s 5.25).', ...pick(44, 104340) },
  { id: 'growth-centres-incentive-hob', why: 'SEPP service 799 Incentive HOB "80-99.9" over a Principal/14 SEPP-drawn 30 m. A CONDITIONAL uplift that exists ONLY in the SEPP service (s 6.16 incentivised development).', ...pick(799, 14964) },
  { id: 'sop-reduced-level', why: 'SEPP service 718 "Reduced Level Map" polygon at Sydney Olympic Park: LAY_NAME says "Maximum Building Height (m)", UNITS m, while the map title says Reduced Level. Principal/14 returns nothing here.', lon: rl.lon, lat: rl.lat },
];
const SEPP_LAYERS = [715, 718, 134, 118, 614, 631, 44, 648, 684, 799, 726, 278];
const LP_VERT = [422, 771, 485, 509, 429, 430, 469, 572, 573, 763, 420, 512];
const idUrl = (svc, layers, x, y) => { const d = 0.0004; const q = new URLSearchParams({ geometry: `${x},${y}`, geometryType: 'esriGeometryPoint', sr: '4283', layers: 'all:' + layers.join(','), tolerance: '0', mapExtent: `${x - d},${y - d},${x + d},${y + d}`, imageDisplay: '400,400,96', returnGeometry: 'false', f: 'json' }); return `https://${HOST}/arcgis/rest/services/${SVC[svc]}/MapServer/identify?${q}`; };
const out = await pool(POINTS, 3, async (p) => {
  const [pr, se, lp] = await Promise.all([get(idUrl('Principal', [14, 11], p.lon, p.lat)), get(idUrl('SEPP', SEPP_LAYERS, p.lon, p.lat)), get(idUrl('LocalProvisions', LP_VERT, p.lon, p.lat))]);
  const tag = (svc, r) => (r.body?.results || []).map((h) => ({ service: svc, layerId: h.layerId, layerName: h.layerName, attributes: h.attributes }));
  const hits = [...tag('PRINCIPAL', pr), ...tag('SEPP', se), ...tag('LOCAL_PROVISIONS', lp)];
  console.log(`${p.id}: ${hits.length} hits — ${hits.map((h) => `${h.service}/${h.layerId}`).join(', ')}`);
  return { id: p.id, why: p.why, lon: p.lon, lat: p.lat, hits };
});
const fixture = { capturedAt: new Date().toISOString().slice(0, 10), note: 'RAW ArcGIS identify attribute bags captured live from mapprod3 ePlanning at points chosen by sepp-overlap2.mjs. Keys exactly as served (alias-keyed identify). Each hit carries the SERVICE it came from because layer ids are per-service. Do not normalise.', points: Object.fromEntries(out.map((o) => [o.id, o])) };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(fixture, null, 1));
console.log('wrote', OUT);
