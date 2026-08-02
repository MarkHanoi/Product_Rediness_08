// PROBE C — assemble probe-c.result.json from the measured artefacts. STAND-DOWN state.
import fs from 'node:fs';
import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const rd = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const draw = rd('probe-c.draw.json');
const s0 = rd('_stage0_siu.json');
const r4 = rd('_round4.json');
const r5 = rd('_round5.json');
const byIne4 = Object.fromEntries(r4.map((r) => [r.ine, r]));
const vc5 = Object.fromEntries(r5.vc.map((r) => [r.ine, r]));

// per-CCAA verdict on what the REGIONAL service actually carries, as measured this session
const CCAA = {
  CL: { pub: 'regional', vec: 'vector', carries: 'clasificacion only (clase de suelo). NO ordinance code.', svc: 'idecyl.jcyl.es/geoserver/urbanismo/wfs' },
  AR: { pub: 'regional', vec: 'vector', carries: 'clasificacion PLUS edificab/aprove/densidad/viv_libr/viv_prot + pdf + web_acu', svc: 'idearagon.aragon.es/geoserver/wfs (SIUa:clasificacion)' },
  VC: { pub: 'regional', vec: 'vector', carries: 'ZONIFICACION - zon_suelo ordinance code + descripcion', svc: 'terramapas.icv.gva.es/0702_Planeamiento' },
  CT: { pub: 'regional', vec: 'vector', carries: 'MUC_QUALIFICACIONS - CODI_QUAL_MUC + CODI_QUAL_AJUNT + CODI_INE', svc: 'sig.gencat.cat/ows/PLANEJAMENT/wfs' },
  MC: { pub: 'regional', vec: 'vector', carries: 'uso_suelo + Clasificacion + EDIFICABILIDAD + Enlace_ficha', svc: 'mapas-gis-inter.carm.es/geoserver/SIT_USU_PLA_URB_CARM/wfs' },
  IB: { pub: 'regional', vec: 'vector', carries: 'QUALIFICACIONS - CODIAJ ordinance code + per-feature normativa URL. FLAGGED not-in-force for Eivissa.', svc: 'ideib.caib.es/.../GOIB_MUIB/MapServer/10' },
  CN: { pub: 'regional', vec: 'vector-behind-WMS', carries: 'ZONIF/ZUSO/CLASI zone codes + plan doc ref, via GetFeatureInfo POINT QUERY ONLY (no bulk WFS found)', svc: 'idecan2.grafcan.es/ServicioWMS/Planeamiento' },
  AN: { pub: 'regional', vec: 'none-found', carries: 'DERA g7 = settlement/block URBAN FABRIC, not planning. No calificacion WFS found.', svc: 'ideandalucia.es/services/DERA_g7_sistema_urbano/wfs' },
  GA: { pub: 'regional', vec: 'vector-partial', carries: 'SIOTUGA IURB_V9 clasificacion w/ CODINE. VERIFIED EMPTY for 36043 while neighbour 36038 returns rows.', svc: 'ideg.xunta.gal/.../POL_AD_PlaneamientoUrbanistico/MapServer' },
  MD: { pub: 'regional', vec: 'vector (NOT per-muni verified)', carries: 'sitcm:VPLA_V_ORDENANZA + VPLA_V_CLASIFICACION found in capabilities. PER-MUNICIPALITY COVERAGE NOT VERIFIED (stand-down).', svc: 'idem.comunidad.madrid/geoserver3/wfs' },
  CM: { pub: 'regional', vec: 'NOT-FOUND', carries: 'Planning viewer is an ArcGIS Online webappviewer (castillalamancha.maps.arcgis.com). No open WFS/REST found in 7 candidates.', svc: 'urbanismo.castillalamancha.es (viewer only)' },
  EX: { pub: 'regional', vec: 'NOT-FOUND', carries: 'SITEX viewer + geoportal.ideex.es. No WFS/REST found in 7 candidates.', svc: 'sitex.juntaex.es/SITEX (viewer only)' },
};

const rows = s0.map((m) => {
  const cc = byIne4[m.ine]?.ccaa;
  const c = CCAA[cc] || {};
  let cov = 'NOT-VERIFIED';
  const r = byIne4[m.ine]?.results || {};
  const sts = Object.values(r).map((x) => x.st);
  if (cc === 'VC') cov = vc5[m.ine]?.layers?.zonificacion?.st || 'NOT-VERIFIED';
  else if (cc === 'CN') cov = 'COVERED';
  else if (cc === 'GA') cov = 'EMPTY-VERIFIED';
  else if (cc === 'MD' || cc === 'CM' || cc === 'EX') cov = 'NOT-VERIFIED';
  else if (sts.includes('COVERED')) cov = 'COVERED';
  else if (sts.length && sts.every((x) => x === 'EMPTY')) cov = 'EMPTY';
  else if (sts.includes('UNKNOWN')) cov = 'UNKNOWN';

  // AN: DERA hit is urban fabric, NOT planning -> planning vector not found
  const planningVector = cc === 'AN' ? 'none-found' : (cov === 'COVERED' ? c.vec : (cov === 'EMPTY-VERIFIED' ? 'none (verified absent)' : 'UNRESOLVED'));

  return {
    ine: m.ine, name: m.name, band: m.band, pop: Math.round(m.pop), ccaa: cc,
    f1_gis_service: cc === 'CM' || cc === 'EX' ? 'Y (viewer only, no data API found)' : (cov === 'COVERED' ? 'Y' : cov === 'EMPTY-VERIFIED' ? 'Y (region-wide service exists; this municipality absent)' : 'Y (service exists, per-muni UNVERIFIED)'),
    f2_digital_pgou: m.siu_figura === 'Sin Planeamiento' ? 'N — SIN PLANEAMIENTO (no instrument at all)' : `Y — ${m.siu_figura} (${m.siu_fecha})`,
    f3_vector_or_scanned: planningVector,
    f4_publisher: c.pub || 'regional',
    siu_figura: m.siu_figura, siu_fecha: m.siu_fecha, siu_register: m.siu_urllink,
    siu_clases_suelo_polys: m.siu_clases_suelo, siu_sectores: m.siu_sectores,
    regional_service: c.svc, regional_carries: c.carries,
    coverage_verified: cov,
  };
});

const res = {
  probe: 'PROBE C — Tier 3 sizing (Spain). STAND-DOWN at 09:37Z, partial.',
  started: '2026-08-02T08:44:02Z', stoodDown: '2026-08-02T09:37Z',
  sampling: { seed: draw.seed, method: draw.prng, frame: draw.frameSource, frameSize: draw.frameSizeAfterExclusions, exclusions: draw.exclusions, perBand: draw.perBand, bandShareOfFrame: draw.bandShareOfFrame },
  nationalCensus: { source: 'SIU/Planeamiento_Vigente/MapServer/0', rows: 8217, errors: 0, figuraVigente: { 'Normas Subsidiarias': 2798, 'Plan General': 2781, 'Sin Planeamiento': 1357, 'Delimitacion de Suelo': 1195, 'null': 86 }, urlLinkTrap: '99.0% carry a UrlLink but only 20 DISTINCT VALUES — per-CCAA register home pages, NOT per-municipality documents' },
  ccaaVerdicts: CCAA,
  rows,
};
fs.writeFileSync(path.join(DIR, 'probe-c.result.json'), JSON.stringify(res, null, 2));

// console table
console.log('| # | municipality | INE | band | pop | CCAA | 1 GIS svc | 2 digital PGOU | 3 vector/scanned | 4 publisher |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
rows.forEach((r, i) => console.log(`| ${i + 1} | ${r.name} | ${r.ine} | ${r.band} | ${r.pop} | ${r.ccaa} | ${r.f1_gis_service} | ${r.f2_digital_pgou} | ${r.f3_vector_or_scanned} | ${r.f4_publisher} |`));
const t = {};
for (const r of rows) t[r.f3_vector_or_scanned] = (t[r.f3_vector_or_scanned] || 0) + 1;
console.log('\nvector-field tally:', JSON.stringify(t));
const fig = {};
for (const r of rows) fig[r.siu_figura] = (fig[r.siu_figura] || 0) + 1;
console.log('sample figura tally:', JSON.stringify(fig));
