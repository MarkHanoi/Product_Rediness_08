// STEP 1 — the 542 register roots.
//
// The prior probe established `url_abs` is 100% populated, 542 distinct URLs for 542
// municipalities, one per municipality. It saved TEN of them. This step pulls ALL 542, because
// TASK 1 is a region-wide census and a census cannot run off a sample of the frame.
//
// ⛔ FILTER GATE, both halves, BEFORE the unfiltered pull is trusted:
//   (a) POSITIVE — PropertyIsLike on a known INE returns only that INE's features;
//   (b) NEGATIVE — an out-of-region INE (Madrid 28079) returns ZERO.
// Half (b) is the one that catches the accepted-and-silently-ignored filter. It is run first.
//
// The unfiltered pull is then reconciled against `resultType=hits`, so a truncated response
// cannot masquerade as a complete census.
import { WFS, wfsUrl, likeFilter, get, owsException, countMembers, parseFeatures, save } from './lib.mjs';

const TN = 'ms:Planeamiento.Zonificacion';
const PROPS = 'cod_ine_mun,noms_mun,url_abs,zon_suelo,clas_suelo,dotacion,expediente';

const out = { typename: TN, gate: {}, hits: null, pulled: null, municipalities: [] };

// ── GATE (b): NEGATIVE FIRST ─────────────────────────────────────────────────
async function pull(ine) {
    const r = await get(wfsUrl({ typename: TN, filter: likeFilter(ine), propertyname: PROPS, maxfeatures: 50 }), 120000);
    const exc = owsException(r.body);
    if (!r.ok || exc) return { st: 'UNKNOWN', why: exc || `HTTP ${r.http ?? r.err}` };
    return { st: 'OK', n: countMembers(r.body), feats: parseFeatures(r.body) };
}
const neg = await pull('28079');
const negClean = neg.st === 'OK' && neg.n === 0;
console.error(`GATE(b) NEGATIVE Madrid 28079: st=${neg.st} n=${neg.n ?? '-'} ${negClean ? 'CLEAN' : '⛔ FILTER NOT APPLIED'}`);

const pos = await pull('03130'); // Tollos — the prior probe's independent known-positive
const posClean = pos.st === 'OK' && pos.n > 0 && pos.feats.every((f) => f.cod_ine_mun === '03130');
console.error(`GATE(a) POSITIVE Tollos 03130: st=${pos.st} n=${pos.n ?? '-'} ${posClean ? 'CLEAN' : '⛔ WRONG-MUNI FEATURES'}`);
out.gate = { negative: { ine: '28079', n: neg.n ?? null, clean: negClean }, positive: { ine: '03130', n: pos.n ?? null, clean: posClean } };
if (!(negClean && posClean)) { console.error('⛔ FILTER GATE FAILED — stopping.'); save('_01_urlabs.json', out); process.exit(1); }

// ── HITS reconciliation ──────────────────────────────────────────────────────
const h = await get(wfsUrl({ typename: TN, hits: true }), 180000);
out.hits = Number((h.body.match(/numberOfFeatures="(\d+)"/) || h.body.match(/numberMatched="(\d+)"/) || [])[1]) || null;
console.error(`resultType=hits → ${out.hits}`);

// ── THE UNFILTERED PULL ──────────────────────────────────────────────────────
// No geometry requested, so this is ~23x lighter than the area census.
const r = await get(wfsUrl({ typename: TN, propertyname: PROPS }), 600000);
const exc = owsException(r.body);
if (!r.ok || exc) { console.error(`⛔ pull failed: ${exc || r.http || r.err}`); save('_01_urlabs.json', out); process.exit(1); }
const feats = parseFeatures(r.body);
out.pulled = feats.length;
console.error(`pulled ${feats.length} features (${(r.bytes / 1048576).toFixed(1)} MB); hits=${out.hits} ${feats.length === out.hits ? 'RECONCILED' : '⛔ MISMATCH'}`);
out.reconciled = feats.length === out.hits;

const byMuni = new Map();
for (const f of feats) {
    const k = f.cod_ine_mun;
    if (!byMuni.has(k)) byMuni.set(k, { ine: k, noms_mun: f.noms_mun, urls: new Set(), polys: 0, byCode: {}, byCodeDot: {}, expedientes: new Set() });
    const m = byMuni.get(k);
    m.polys++;
    if (f.url_abs) m.urls.add(f.url_abs);
    if (f.expediente) m.expedientes.add(f.expediente);
    m.byCode[f.zon_suelo] = (m.byCode[f.zon_suelo] || 0) + 1;
    const dot = f.dotacion ? 'DOT' : 'NODOT';
    m.byCodeDot[`${f.zon_suelo}|${dot}`] = (m.byCodeDot[`${f.zon_suelo}|${dot}`] || 0) + 1;
}
out.municipalities = [...byMuni.values()]
    .map((m) => ({ ...m, urls: [...m.urls], expedientes: m.expedientes.size }))
    .sort((a, b) => a.ine.localeCompare(b.ine));

const noUrl = out.municipalities.filter((m) => m.urls.length === 0);
const multiUrl = out.municipalities.filter((m) => m.urls.length > 1);
console.error(`municipalities=${out.municipalities.length}  withoutUrl=${noUrl.length}  multiUrl=${multiUrl.length}`);
console.error(`distinct url_abs = ${new Set(out.municipalities.flatMap((m) => m.urls)).size}`);
out.summary = {
    municipalities: out.municipalities.length,
    distinctUrls: new Set(out.municipalities.flatMap((m) => m.urls)).size,
    withoutUrl: noUrl.map((m) => m.ine),
    multiUrl: multiUrl.map((m) => m.ine),
};
save('_01_urlabs.json', out);
