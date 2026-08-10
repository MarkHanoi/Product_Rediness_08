// STEP 1 — resolve `url_abs` for a PURPOSIVE sample of three municipalities.
//
// ⭐ THE SAMPLE IS PURPOSIVE, NOT RANDOM, AND IS DECLARED AS SUCH. Three municipalities were
// chosen to span the two axes that plausibly drive register quality — SETTLEMENT SIZE and
// PROVINCE (the register is filed under three provincial trees, so a per-province difference in
// filing practice is a live hypothesis). One per size class, one per province:
//
//   46250 València    prov. València  ~800k inh  — the capital; the 1,967 ZUR-RE polygons the
//                                                  refuted grammar hypothesis was measured on
//   12135 Vila-real   prov. Castelló  ~51k  inh  — mid-sized industrial/agricultural city
//   03130 Tollos      prov. Alacant   ~50   inh  — the smallest tail; also the grammar probe's
//                                                  independent known-positive control (13 polygons)
//
// ⚠ THIS IS N=3 OF 542. It bounds nothing statistically. It answers one question — is the ER-3
// route REAL — and if the three disagree, that disagreement is itself the finding.
//
// ⛔ TRANSPORT: PropertyIsLike only, with BOTH halves of the filter gate applied —
//   (1) every returned feature must carry the requested cod_ine_mun, and
//   (2) a value known to be OUTSIDE the region (Madrid 28079) must return ZERO.
import { likeFilter, wfsUrl, get, owsException, countMembers, parseFeatures, save } from './lib.mjs';

const SAMPLE = [
    { ine: '46250', name: 'València', prov: 'València', klass: 'large-urban', why: 'regional capital; the polygon set the grammar hypothesis was refuted on' },
    { ine: '12135', name: 'Vila-real', prov: 'Castelló', klass: 'mid-sized', why: '~51k inhabitants; different provincial filing tree' },
    { ine: '03130', name: 'Tollos', prov: 'Alacant', klass: 'small-rural', why: 'smallest tail (~50 inh); grammar probe independent known-positive (13 polygons)' },
];
const NEGATIVE = { ine: '28079', name: 'Madrid (OUT OF REGION)' };
const TN = 'ms:Planeamiento.Zonificacion';

async function pull(ine) {
    const u = wfsUrl({ typename: TN, filter: likeFilter(ine), maxfeatures: 50, propertyname: 'cod_ine_mun,noms_mun,expediente,url_abs,zon_suelo,clas_suelo' });
    const r = await get(u, 120000);
    const exc = owsException(r.body);
    if (!r.ok || exc) return { st: 'UNKNOWN', why: exc || `HTTP ${r.http ?? r.err}` };
    const feats = parseFeatures(r.body);
    return { st: 'OK', n: countMembers(r.body), feats };
}

const out = { transport: 'OGC PropertyIsLike on cod_ine_mun', typename: TN, sample: [], negativeControl: null, filterGate: null };

// ── HALF 2 OF THE GATE FIRST. If Madrid returns features, every number below is a regional total.
const neg = await pull(NEGATIVE.ine);
console.error(`NEGATIVE CONTROL ${NEGATIVE.name} (${NEGATIVE.ine}): st=${neg.st} n=${neg.n ?? '-'} ${neg.why || ''}`);
out.negativeControl = { ...NEGATIVE, st: neg.st, n: neg.n ?? null, why: neg.why ?? null };
const negClean = neg.st === 'OK' && neg.n === 0;
if (!negClean) console.error('  ⛔ NEGATIVE CONTROL DID NOT RETURN ZERO — the filter is not being applied. STOP.');

for (const m of SAMPLE) {
    const r = await pull(m.ine);
    if (r.st !== 'OK') {
        console.error(`${m.name.padEnd(10)} UNKNOWN: ${r.why}`);
        out.sample.push({ ...m, st: 'UNKNOWN', why: r.why });
        continue;
    }
    // HALF 1 OF THE GATE: every feature must actually carry the requested value.
    const wrong = r.feats.filter((f) => f.cod_ine_mun !== m.ine);
    const urls = [...new Set(r.feats.map((f) => f.url_abs).filter(Boolean))];
    const exps = [...new Set(r.feats.map((f) => f.expediente).filter(Boolean))];
    console.error(
        `${m.name.padEnd(10)} n=${String(r.n).padStart(3)} wrongMuni=${wrong.length} distinctUrl=${urls.length} distinctExp=${exps.length}`,
    );
    for (const u of urls) console.error(`    url_abs: ${u}`);
    out.sample.push({
        ...m, st: 'OK', nReturned: r.n, wrongMuniFeatures: wrong.length,
        urlAbs: urls, expedientes: exps,
        noms_mun: [...new Set(r.feats.map((f) => f.noms_mun))],
        zonSuelo: [...new Set(r.feats.map((f) => f.zon_suelo))].slice(0, 12),
    });
}

const positiveClean = out.sample.every((s) => s.st === 'OK' && s.wrongMuniFeatures === 0);
out.filterGate = {
    positiveVerified: positiveClean, negativeClean: negClean,
    verdict: positiveClean && negClean ? 'FILTER APPLIED — both halves hold' : '⛔ FILTER NOT ESTABLISHED',
};
console.error(`\nFILTER GATE: ${out.filterGate.verdict}`);
save('_01_sample.json', out);
