// STEP 1 — TRANSPORT VALIDATION + KNOWN-ANSWER CONTROL.
//
// Establishes, before any counting is trusted:
//   (a) the attribute filter returns data for a municipality whose answer we already know;
//   (b) a NEGATIVE control — an INE code outside the Comunitat Valenciana MUST return EMPTY.
//       Without it, "COVERED" could just mean "the filter is being ignored", which would make
//       every downstream count meaningless.
//   (c) whether resultType=hits is supported (exact counts without truncation risk);
//   (d) whether hits agrees with a full download (the anti-truncation cross-check).
import { sweepFeature, ineFilter, featureUrl, get, owsException, countMembers, parseFeatures, save, BASE } from './lib.mjs';

const TN = 'ms:Planeamiento.Zonificacion';
const out = { controls: {}, hits: {}, sample: {} };

// ── KNOWN-ANSWER CONTROLS ────────────────────────────────────────────────────
// POSITIVE: València capital, INE 46250. Independently known to be covered — it is the city
// this programme already registered (determination 36.4% by area) and its PGOU is in the repo.
// NEGATIVE: 28079 Madrid — a real INE code, definitively NOT in the Comunitat Valenciana.
const CONTROLS = [
    { tag: 'POSITIVE valencia-46250', ine: '46250', expect: 'COVERED' },
    { tag: 'NEGATIVE madrid-28079', ine: '28079', expect: 'EMPTY' },
    { tag: 'NEGATIVE nonsense-99999', ine: '99999', expect: 'EMPTY' },
];

for (const c of CONTROLS) {
    const r = await sweepFeature({ typename: TN, filter: ineFilter(c.ine), maxfeatures: 3 });
    const pass = r.st === c.expect;
    out.controls[c.tag] = { ine: c.ine, expect: c.expect, got: r.st, n: r.n, pass, cells: r.cells };
    console.error(`${pass ? 'PASS' : '**FAIL**'} ${c.tag}: expect=${c.expect} got=${r.st} n=${r.n}`);
    if (c.expect === 'COVERED' && r.feats?.length) out.sample.valencia = r.feats;
}

// ── resultType=hits SUPPORT ──────────────────────────────────────────────────
async function hits(ine) {
    const u = featureUrl({ typename: TN, filter: ineFilter(ine), maxfeatures: null }) + '&resultType=hits';
    const r = await get(u);
    const exc = owsException(r.body);
    if (!r.ok || exc) return { st: 'UNKNOWN', why: exc || `HTTP ${r.http ?? r.err}` };
    const m = r.body.match(/numberOfFeatures="(\d+)"/) || r.body.match(/numberMatched="(\d+)"/);
    return m ? { st: 'OK', n: Number(m[1]) } : { st: 'UNKNOWN', why: 'no count attr', snip: r.body.slice(0, 300) };
}

for (const ine of ['46250', '28079']) {
    out.hits[ine] = await hits(ine);
    console.error(`hits ${ine}: ${JSON.stringify(out.hits[ine]).slice(0, 200)}`);
}

// ── ANTI-TRUNCATION CROSS-CHECK ──────────────────────────────────────────────
// Download València's Zonificacion WITHOUT maxfeatures and compare to the hits count. If the
// download lands exactly on 1000/2000/3000 while hits reports more, the service truncates and
// every "full download" count in this run is a floor, not a total.
{
    const u = featureUrl({ typename: TN, filter: ineFilter('46250'), maxfeatures: null });
    const r = await get(u, 240000);
    const exc = owsException(r.body);
    if (!r.ok || exc) {
        out.truncation = { st: 'UNKNOWN', why: exc || `HTTP ${r.http ?? r.err}` };
    } else {
        const n = countMembers(r.body);
        const roundSuspect = [1000, 2000, 3000, 5000, 10000].includes(n);
        const hitsN = out.hits['46250']?.n ?? null;
        out.truncation = {
            downloaded: n,
            hits: hitsN,
            agree: hitsN != null ? n === hitsN : null,
            roundSuspect,
            bytes: r.body.length,
        };
        const feats = parseFeatures(r.body);
        out.sample.valenciaFieldKeys = [...new Set(feats.flatMap((f) => Object.keys(f)))];
        out.sample.valenciaFeatureCount = feats.length;
    }
    console.error(`truncation check: ${JSON.stringify(out.truncation)}`);
}

save('_01_validate.json', out);
