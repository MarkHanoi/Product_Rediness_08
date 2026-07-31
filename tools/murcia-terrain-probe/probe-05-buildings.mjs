// PROBE 05 — Catastro INSPIRE Buildings (BU) for the target parcel and its surround.
//
// ⚠ PROVENANCE RULE. `numberOfFloorsAboveGround` (the INSPIRE encoding of Catastro's ALTURAS) is an
// ADMINISTRATIVE DECLARATION recorded for fiscal/registry purposes — it is NOT a survey measurement,
// and Catastro does not publish it as one. This probe therefore records floor COUNTS and never
// multiplies them into metres. Metres come from an independent geometric source (probe 06 nDSM).
//
// Run:  node tools/murcia-terrain-probe/probe-05-buildings.mjs

import { probeFetch, owsException, saveJson, loadProj4, SITE } from './lib.mjs';

const CP = 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx';
const BU = 'https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx';

const proj4 = await loadProj4();
proj4.defs('EPSG:25830', '+proj=utm +zone=30 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
const fwd = proj4('EPSG:4326', 'EPSG:25830');
const inv = proj4('EPSG:25830', 'EPSG:4326');
const centre = fwd.forward([SITE.lon, SITE.lat]);

const out = { site: SITE, probedAt: new Date().toISOString(), steps: [] };

/** Record a probe result with its distinct failure mode preserved. */
function rec(name, url, r, extra = {}) {
  const exc = r.ok ? owsException(r.text) : null;
  const step = { name, url, status: r.status, kind: r.kind, contentType: r.contentType,
    bytes: r.bytes, lengthMismatch: r.lengthMismatch, exception: exc, ...extra };
  out.steps.push(step);
  console.log(`\n[${name}] HTTP ${r.status} ${r.contentType} ${r.bytes}B mismatch=${r.lengthMismatch} exc=${exc ? 'YES' : 'no'}`);
  if (exc) console.log('  EXCEPTION:', exc.slice(0, 240));
  return { exc, step };
}

/** Parse a gml:posList into [E,N] pairs (srsName=EPSG::25830 → native metres, x=E y=N). */
function posList25830(s) {
  const n = s.trim().split(/\s+/).map(Number).filter(Number.isFinite);
  const pts = []; for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
  return pts;
}
const ringAreaM2 = (p) => { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] * p[i][1] - p[i][0] * p[j][1]); return Math.abs(a / 2); };
const centroidOf = (p) => { let x = 0, y = 0; for (const q of p) { x += q[0]; y += q[1]; } return [x / p.length, y / p.length]; };

// ── 1. The target PARCEL (stored query by refcat) ───────────────────────────────────────────────
const cpUrl = `${CP}?service=WFS&version=2.0.0&request=getfeature&STOREDQUERIE_ID=GetParcel`
  + `&refcat=${SITE.refcat}&srsname=EPSG::25830`;
{
  const r = await probeFetch(cpUrl, { label: 'cp-getparcel', accept: 'text/xml', timeoutMs: 90_000 });
  const { exc } = rec('CP GetParcel (refcat)', cpUrl, r);
  if (r.ok && !exc) {
    const posM = r.text.match(/<gml:exterior>[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/);
    const areaAttr = r.text.match(/<cp:areaValue[^>]*>([\d.]+)</);
    const refM = r.text.match(/<cp:nationalCadastralReference>([^<]+)</);
    const ring = posM ? posList25830(posM[1]) : null;
    const geomArea = ring ? ringAreaM2(ring) : null;
    const c = ring ? centroidOf(ring) : null;
    out.parcel = {
      refcatReturned: refM?.[1] ?? null,
      declaredAreaValueM2: areaAttr ? Number(areaAttr[1]) : null,
      officialAreaM2: SITE.officialAreaM2,
      geometricAreaM2: geomArea, vertices: ring?.length ?? 0,
      centroid25830: c, centroidWgs84: c ? inv.forward(c) : null,
      ringSample25830: ring?.slice(0, 6) ?? null,
    };
    console.log('  refcat returned  :', refM?.[1]);
    console.log('  areaValue (decl.):', areaAttr?.[1], 'm2   | founder-stated official:', SITE.officialAreaM2, 'm2');
    console.log('  geometric area   :', geomArea?.toFixed(1), 'm2 from', ring?.length, 'vertices');
    console.log('  centroid EPSG:25830:', c?.map((v) => v.toFixed(2)).join(', '));
    console.log('  centroid WGS84     :', c ? inv.forward(c).map((v) => v.toFixed(6)).join(', ') : null);
  } else if (r.ok) { console.log('  head:', r.head?.slice(0, 300)); }
}

// ── 2. Buildings ON the target parcel (stored query) ────────────────────────────────────────────
const buUrl = `${BU}?service=WFS&version=2.0.0&request=getfeature&STOREDQUERIE_ID=GetBuildingByParcel`
  + `&refcat=${SITE.refcat}&srsname=EPSG::25830`;
{
  const r = await probeFetch(buUrl, { label: 'bu-byparcel', accept: 'text/xml', timeoutMs: 120_000 });
  const { exc } = rec('BU GetBuildingByParcel (refcat)', buUrl, r);
  if (r.ok && !exc) {
    const parts = r.text.match(/<bu-ext2d:BuildingPart\b[\s\S]*?<\/bu-ext2d:BuildingPart>/g) ?? [];
    const bldgs = r.text.match(/<bu-core2d:Building\b[\s\S]*?<\/bu-core2d:Building>/g)
      ?? r.text.match(/<bu-ext2d:Building\b[\s\S]*?<\/bu-ext2d:Building>/g) ?? [];
    const onParcel = parts.map((m) => {
      const above = m.match(/numberOfFloorsAboveGround>\s*(-?\d+)/i);
      const below = m.match(/numberOfFloorsBelowGround>\s*(-?\d+)/i);
      const ext = m.match(/<gml:exterior>[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/);
      const ring = ext ? posList25830(ext[1]) : null;
      return {
        gmlId: m.match(/gml:id="([^"]+)"/)?.[1] ?? null,
        floorsAboveGround: above ? Number(above[1]) : null,
        floorsBelowGround: below ? Number(below[1]) : null,
        footprintAreaM2: ring ? Number(ringAreaM2(ring).toFixed(1)) : null,
        centroid25830: ring ? centroidOf(ring).map((v) => Number(v.toFixed(2))) : null,
      };
    });
    // Building-level attributes carry the dates/use.
    const attrs = (src) => ({
      dateOfConstruction: src.match(/dateOfConstruction>[\s\S]*?<[^>]*>([^<]+)</)?.[1]?.trim()
        ?? src.match(/<bu-core2d:dateOfConstruction>([^<]+)</)?.[1]?.trim() ?? null,
      currentUse: src.match(/currentUse>([^<]+)</)?.[1]?.trim() ?? null,
      conditionOfConstruction: src.match(/conditionOfConstruction>([^<]+)</)?.[1]?.trim() ?? null,
      numberOfDwellings: src.match(/numberOfDwellings>\s*(\d+)/)?.[1] ?? null,
      numberOfBuildingUnits: src.match(/numberOfBuildingUnits>\s*(\d+)/)?.[1] ?? null,
      officialArea: src.match(/value uom="m2">\s*([\d.]+)/)?.[1] ?? null,
    });
    out.targetParcelBuildings = {
      buildingElements: bldgs.length, buildingParts: parts.length,
      parts: onParcel,
      buildingAttributes: bldgs.map(attrs),
      rawHasAlturas: /ALTURAS/i.test(r.text),
    };
    console.log(`  Building elements: ${bldgs.length}   BuildingPart elements: ${parts.length}`);
    for (const p of onParcel) console.log(`   part ${p.gmlId} floors above=${p.floorsAboveGround} below=${p.floorsBelowGround} area=${p.footprintAreaM2} m2`);
    for (const a of bldgs.map(attrs)) console.log('   bldg attrs:', JSON.stringify(a));
  } else if (r.ok) { console.log('  head:', r.head?.slice(0, 400)); }
}

// ── 3. SURROUNDING buildings (bbox ~200 m) — context for the sibling agent's envelope work ──────
{
  const halfM = 100;
  const sw = inv.forward([centre[0] - halfM, centre[1] - halfM]);
  const ne = inv.forward([centre[0] + halfM, centre[1] + halfM]);
  const [w, s] = sw, [e, n] = ne;
  const url = `${BU}?service=WFS&version=2.0.0&request=GetFeature&typeNames=bu:BuildingPart`
    + `&srsName=urn:ogc:def:crs:EPSG::4326&bbox=${s},${w},${n},${e},urn:ogc:def:crs:EPSG::4326&count=800`;
  const r = await probeFetch(url, { label: 'bu-bbox', accept: 'text/xml', timeoutMs: 180_000 });
  const { exc } = rec('BU bbox 200 m (BuildingPart)', url, r, { bboxWgs84: [w, s, e, n] });
  if (r.ok && !exc) {
    const parts = r.text.match(/<bu-ext2d:BuildingPart\b[\s\S]*?<\/bu-ext2d:BuildingPart>/g) ?? [];
    const floors = [];
    const ids = new Set();
    for (const m of parts) {
      const id = m.match(/gml:id="([^"]+?)(?:_part\d+)?"/)?.[1]; if (id) ids.add(id);
      const a = m.match(/numberOfFloorsAboveGround>\s*(-?\d+)/i);
      if (a) floors.push(Number(a[1]));
    }
    const hist = {};
    for (const f of floors) hist[f] = (hist[f] ?? 0) + 1;
    out.surroundBuildings = {
      bboxWgs84: [w, s, e, n], boxSizeM: halfM * 2,
      buildingPartCount: parts.length, distinctBuildings: ids.size,
      partsWithFloorCount: floors.length,
      floorsHistogram: hist,
      floorsMin: floors.length ? Math.min(...floors) : null,
      floorsMax: floors.length ? Math.max(...floors) : null,
      floorsMean: floors.length ? Number((floors.reduce((a, b) => a + b, 0) / floors.length).toFixed(2)) : null,
      // A `count` cap that is exactly hit means MORE data existed → truncation, not absence.
      capHit: ids.size >= 800,
    };
    console.log(`  parts=${parts.length} distinctBuildings=${ids.size} withFloors=${floors.length}`);
    console.log('  floors histogram:', JSON.stringify(hist));
  } else if (r.ok) { console.log('  head:', r.head?.slice(0, 400)); }
}

saveJson('out-05-buildings.json', out);
console.log('\nwrote out-05-buildings.json');
