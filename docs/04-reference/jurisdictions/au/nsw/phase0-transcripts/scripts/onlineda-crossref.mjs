// §ONLINE-DA-CROSSREF (round 3) — one LGA (City of Sydney), every DA determined in 2025, joined at
// its served X/Y to (a) the City of Sydney DCP "Building height in storeys" polygon and (b) the
// State's Principal/14 HOB polygon.
//
// ⛔ THE COMPARISON IS STOREYS-AGAINST-STOREYS ONLY. The DA feed serves `NumberOfStoreys` and NO
// metres; the LEP serves metres and no storeys. Those are not inter-convertible without a
// floor-to-floor assumption PRYZM must not invent (build prompt §6 in another costume; PT art. 65).
// The HOB is recorded alongside for the reader and is NOT compared.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../onlineda-crossref.json');
const agent = new https.Agent({ keepAlive: true, maxSockets: 6 });
function req(url, headers = {}) { return new Promise((r) => { const u = new URL(url); const q = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers, timeout: 60000, agent }, (x) => { let b = ''; x.setEncoding('utf8'); x.on('data', (c) => { if (b.length < 12000000) b += c; }); x.on('end', () => { try { r({ s: x.statusCode, j: JSON.parse(b) }); } catch { r({ s: x.statusCode, j: null, raw: b.slice(0, 300) }); } }); }); q.on('timeout', () => q.destroy(new Error('t'))); q.on('error', (e) => r({ s: 0, err: String(e) })); q.end(); }); }
async function pool(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (true) { const k = i++; if (k >= items.length) break; out[k] = await fn(items[k], k); } })); return out; }
const EP = 'https://api.apps1.nsw.gov.au/eplanning/data/v0/OnlineDA';
const DCP7 = 'https://services1.arcgis.com/cNVyNtjGVZybOQWZ/arcgis/rest/services/Sydney_Development_Control_Plan_2012/FeatureServer/7';
const P14 = 'https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/ePlanning/Planning_Portal_Principal_Planning/MapServer/14';
const filters = { filters: { CouncilName: ['Council of the City of Sydney'], ApplicationStatus: ['Determined'], DeterminationDateFrom: '2025-01-01', DeterminationDateTo: '2025-12-31' } };

// 1. Pull every page.
const apps = []; let page = 1, totalPages = 1; const keyUnion = new Set(); const statusVals = {}; const typeVals = {}; const authVals = {};
do {
  const r = await req(EP, { PageSize: '100', PageNumber: String(page), filters: JSON.stringify(filters), Accept: 'application/json' });
  if (r.s !== 200) { console.log('page', page, 'status', r.s, r.raw ?? r.err); break; }
  totalPages = r.j.TotalPages ?? 1;
  for (const a of r.j.Application || []) { apps.push(a); for (const k of Object.keys(a)) keyUnion.add(k); statusVals[a.ApplicationStatus] = (statusVals[a.ApplicationStatus] || 0) + 1; typeVals[a.ApplicationType] = (typeVals[a.ApplicationType] || 0) + 1; authVals[a.DeterminationAuthority] = (authVals[a.DeterminationAuthority] || 0) + 1; }
  console.log(`page ${page}/${totalPages}: ${r.j.Application?.length ?? 0} records (TotalCount ${r.j.TotalCount})`);
  page++;
} while (page <= totalPages && page <= 20);
console.log(`\npulled ${apps.length} DAs · keys: ${[...keyUnion].join(', ')}`);
console.log('ApplicationStatus:', JSON.stringify(statusVals), '\nApplicationType:', JSON.stringify(typeVals), '\nDeterminationAuthority:', JSON.stringify(authVals));
const devTypes = {}; for (const a of apps) for (const d of a.DevelopmentType || []) devTypes[d.DevelopmentType] = (devTypes[d.DevelopmentType] || 0) + 1;
console.log('DevelopmentType (top 25):', JSON.stringify(Object.entries(devTypes).sort((a, b) => b[1] - a[1]).slice(0, 25)));

// 2. Join the ones that state a storey count and a location.
const cand = apps.filter((a) => typeof a.NumberOfStoreys === 'number' && a.NumberOfStoreys > 0 && a.Location?.[0]?.X && a.Location?.[0]?.Y);
console.log(`\n${cand.length} DAs carry NumberOfStoreys > 0 and a served X/Y`);
const joined = await pool(cand, 5, async (a) => {
  const x = Number(a.Location[0].X), y = Number(a.Location[0].Y);
  const d = await req(`${DCP7}/query?geometry=${x},${y}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=Storeys,DCP_Name,Date&returnGeometry=false&f=json`);
  const dcp = (d.j?.features || []).map((f) => f.attributes);
  const dd = 0.0004;
  const idq = new URLSearchParams({ geometry: `${x},${y}`, geometryType: 'esriGeometryPoint', sr: '4283', layers: 'all:14', tolerance: '0', mapExtent: `${x - dd},${y - dd},${x + dd},${y + dd}`, imageDisplay: '400,400,96', returnGeometry: 'false', f: 'json' });
  const h = await req(`${P14.replace(/\/14$/, '')}/identify?${idq}`);
  const hob = (h.j?.results || []).filter((r) => r.layerId === 14).map((r) => ({ epi: r.attributes['EPI Name'], v: r.attributes['Maximum Building Height'], units: r.attributes['Units'], clause: r.attributes['Legislative Clause'] }));
  const dcpInts = dcp.map((r) => (/^\d+$/.test(String(r.Storeys)) ? Number(r.Storeys) : null));
  const dcpMax = dcpInts.every((n) => n !== null) && dcpInts.length ? Math.max(...dcpInts) : null;
  let verdict;
  if (dcp.length === 0) verdict = 'no-dcp-storeys-polygon';
  else if (dcpMax === null) verdict = 'dcp-storeys-non-numeric'; // ">15", "Existing height", null
  else if (a.NumberOfStoreys > dcpMax) verdict = 'storeys-exceed-dcp';
  else verdict = 'within-dcp-storeys';
  return { pan: a.PlanningPortalApplicationNumber, councilRef: a.CouncilApplicationNumber, address: a.Location[0].FullAddress, lon: x, lat: y, storeys: a.NumberOfStoreys, newDwellings: a.NumberOfNewDwellings, cost: a.CostOfDevelopment, epiVariation: a.EPIVariationProposedFlag, devTypes: (a.DevelopmentType || []).map((t) => t.DevelopmentType), authority: a.DeterminationAuthority, determined: a.DeterminationDate, dcp, dcpMaxStoreys: dcpMax, hob, verdict };
});
const tally = {}; for (const j of joined) tally[j.verdict] = (tally[j.verdict] || 0) + 1;
console.log('\nVERDICTS:', JSON.stringify(tally));
const exceed = joined.filter((j) => j.verdict === 'storeys-exceed-dcp');
console.log(`\n${exceed.length} DAs approved/determined with MORE storeys than the DCP polygon states:`);
for (const j of exceed) console.log(`   ${j.pan} ${j.councilRef} · ${j.storeys} storeys vs DCP ${j.dcpMaxStoreys} (${j.dcp.map((d) => d.DCP_Name).join('/')}) · HOB ${j.hob.map((h) => `${h.v} ${h.units}`).join('+') || 'none'} · cl4.6 variation flag=${j.epiVariation} · ${j.devTypes.join('; ').slice(0, 90)} · ${j.address}`);
const varY = joined.filter((j) => j.epiVariation === 'Y').length;
console.log(`\nEPIVariationProposedFlag='Y' on ${varY} of ${joined.length} joined DAs; among the ${exceed.length} exceeders: ${exceed.filter((j) => j.epiVariation === 'Y').length}`);
fs.writeFileSync(OUT, JSON.stringify({ probedAt: new Date().toISOString().slice(0, 10), endpoint: EP, filters, pulled: apps.length, keyUnion: [...keyUnion], statusVals, typeVals, authVals, devTypes, candidates: cand.length, tally, joined }, null, 1));
console.log('\nwrote', OUT);
