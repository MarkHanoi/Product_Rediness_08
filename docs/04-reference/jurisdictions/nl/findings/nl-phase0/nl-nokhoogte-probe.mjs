#!/usr/bin/env node
// NL — the ROOF-PARAMETER TEXT PROBE (founder review §5, the one measurement he asked for and we had
// not made). Lane ENVELOPE-NLDK round 4, 2026-09-04.
//
// THE QUESTION, verbatim from the founder:
//   *"⚠ Measure `nokhoogte` in TEXT too. We report the structured zero but not the text share; if it
//   tracks `dakhelling`, the two together close a lot of triangles."*
//
// Phase 0 measured `dakhelling` in 28.8 % of plan TEXT against 0 % structured, and reported the
// structured zero for `nokhoogte` — but never its text share. That asymmetry is the gap: without it,
// M5's claim "roof geometry is structurally absent" rests on a field that is not the only place the
// rule lives.
//
// ⭐ WHAT ACTUALLY MATTERS IS CO-OCCURRENCE, NOT FOUR SEPARATE SHARES. A roof section closes when a
// plan carries an eaves plane AND something that fixes the top — a ridge height or a pitch. So this
// harness reports, PER PLAN, which of the four parameters appear in the regels text and then bins the
// plan into the SAME vocabulary the runtime already ships (`NlRoofBoundType` in
// `packages/site-parcel-data/src/rulepacks/nlRoofDeterminacy.ts`), so the measurement is directly
// comparable to what the product renders.
//
// ⚠ A DETECTOR, NOT A LEGAL READING. Every window is stored VERBATIM, so a human can sign or reject
// each one (lane rule, after the 10× `peil` bug: fixtures are QUOTED from the sample, never written
// by the regex's author). A hit means "the plan's text names this parameter with a number in its
// units", NOT "this parameter binds this parcel" — that is applicability (deep audit Gap 1), and it
// is a different question resolved by `nlApplicability.ts`.
//
// ⚠ AND IT IS PER PLAN, NOT PER PARCEL. A plan carrying a goothoogte somewhere in its regels does not
// carry one for every bestemming in it. The share below is therefore an UPPER BOUND on the parcel-level
// share, and must never be quoted as the latter.
//
// USAGE:
//   node nl-nokhoogte-probe.mjs --sample=nl-phase0-sample-land.json,nl-phase0-sample-urban.json \
//        --n=60 --seed=20260903 --out=nl-nokhoogte-probe.json

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), 'true'];
}));
const SAMPLES = String(args.sample ?? 'nl-phase0-sample-land.json,nl-phase0-sample-urban.json')
    .split(',').map((s) => s.trim()).filter(Boolean);
const N = Number(args.n ?? 60);
const SEED = Number(args.seed ?? 20260903);
const OUT = args.out ?? 'nl-nokhoogte-probe.json';
const CONCURRENCY = Number(args.concurrency ?? 2);

const fs = await import('node:fs');

function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rnd = mulberry32(SEED);

function planStatusRank(status) {
    const s = String(status ?? '').toLowerCase();
    if (s.includes('onherroepelijk')) return 4;
    if (s.includes('geconsolideerd')) return 3;
    if (s.includes('vastgesteld')) return 2;
    if (s.includes('ontwerp')) return 1;
    return 0;
}

// ── 1. collect the governing plans (same status-rank rule as the sibling harnesses) ───────────
const plans = new Map();
for (const f of SAMPLES) {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const row of d.rows) {
        const feats = row.layers?.bestemmingsplangebied ?? [];
        if (!Array.isArray(feats) || feats.length === 0) continue;
        let best = null;
        for (const p of feats) {
            const rank = planStatusRank(p.dossierstatus ?? p.planstatus);
            const date = String(p.datum ?? '');
            if (!best || rank > best.rank || (rank === best.rank && date > best.date)) best = { rank, date, p };
        }
        const p = best.p;
        const planId = p.plangebied || p.identificatie || p.dossierid;
        if (!planId) continue;
        const groups = (row.layers?.enkelbestemming ?? []).map((e) => String(e.bestemmingshoofdgroep ?? '').toLowerCase()).filter(Boolean);
        const raw = String(p.verwijzingnaartekst ?? '');
        const listed = raw.split(',').map((u) => u.split('#')[0].trim()).filter(Boolean).map((u) => u.replace(/^http:\/\//, 'https://'));
        const isRules = (u) => /\/(r|pt)_[^/]*$/i.test(u);
        const candidates = [
            ...listed.filter(isRules),
            'https://ruimtelijkeplannen.nl/documents/' + planId + '/r_' + planId + '.html',
            'https://ruimtelijkeplannen.nl/documents/' + planId + '/pt_' + planId + '.xml',
            'https://ruimtelijkeplannen.nl/documents/' + planId + '/r_' + planId + '.xml',
        ].filter((v, i, a) => a.indexOf(v) === i);
        const prev = plans.get(planId);
        if (prev) { prev.nParcels++; for (const g of groups) prev.hoofdgroepen.add(g); continue; }
        plans.set(planId, {
            planId, candidates, naam: p.naam ?? null, naamoverheid: p.naamoverheid ?? null,
            typeplan: p.typeplan ?? null, datum: p.datum ?? null, dossierstatus: p.dossierstatus ?? null,
            hoofdgroepen: new Set(groups), nParcels: 1,
        });
    }
}
const all = [...plans.values()].sort((a, b) => a.planId.localeCompare(b.planId));
process.stderr.write(`distinct governing plans: ${all.length}\n`);
function draw(pool, n) {
    const src = pool.slice(); const out = [];
    while (out.length < Math.min(n, src.length)) out.push(src.splice(Math.floor(rnd() * src.length), 1)[0]);
    return out;
}
const chosen = draw(all, N);

// ── 2. fetch (2 workers, long backoff — ruimtelijkeplannen.nl throttles; a throttle is NOT an absence) ──
async function fetchText(url) {
    let last = 'unknown';
    for (let i = 0; i < 4; i++) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 45000);
        try {
            const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'PRYZM-NL-Phase0/1.0 (+https://pryzm.fly.dev)' } });
            clearTimeout(timer);
            const b = await r.text();
            if (r.ok) return { ok: true, body: b };
            last = 'HTTP ' + r.status;
            if (r.status === 404 || r.status === 410) return { ok: false, error: last };
        } catch (e) {
            clearTimeout(timer);
            last = e.name === 'AbortError' ? 'timeout' : e.message;
        }
        await new Promise((res) => setTimeout(res, 1500 * Math.pow(2, i)));
    }
    return { ok: false, error: 'retries-exhausted-last=' + last };
}
function flatten(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#160;/g, ' ')
        .replace(/&deg;/gi, '°').replace(/&#176;/g, '°')
        .replace(/\s+/g, ' ').trim();
}
const MIN_RULES_CHARS = 3000;
async function fetchRules(cands) {
    const tried = [];
    for (const u of cands.slice(0, 5)) {
        const res = await fetchText(u);
        if (!res.ok) { tried.push(u + ' -> ' + res.error); continue; }
        const text = flatten(res.body);
        if (text.length < MIN_RULES_CHARS) { tried.push(u + ' -> TOO-SMALL(' + text.length + ')'); continue; }
        return { ok: true, url: u, text, tried };
    }
    return { ok: false, tried };
}

// ── 3. the detectors ─────────────────────────────────────────────────────────────────────────
// Each parameter needs its NAME and, within 120 chars, a NUMBER IN ITS OWN UNIT. A bare mention in a
// begripsbepaling ("goothoogte van een bouwwerk: …") carries no number and is deliberately NOT a hit:
// the question is whether the plan SETS the parameter, not whether it defines the word.
const METRES = String.raw`(\d{1,3}(?:[.,]\d+)?)\s*(?:m\b|meter)`;
const DEGREES = String.raw`(\d{1,2}(?:[.,]\d+)?)\s*(?:°|graden|graad)`;
const PARAMS = {
    // "goothoogte … maximaal 6 m", "maximale goothoogte 6 meter"
    goothoogte: { name: String.raw`goothoogte|goot-\s?en\s?bouwhoogte|hoogte van de goot`, unit: METRES },
    // "bouwhoogte … niet meer dan 10 m". ⚠ `goot- en bouwhoogte` is matched by BOTH, deliberately:
    // that phrasing sets both planes, and attributing it to one would understate the other.
    bouwhoogte: { name: String.raw`bouwhoogte|goot-\s?en\s?bouwhoogte|hoogte van het bouwwerk`, unit: METRES },
    // "nokhoogte … maximaal 11 m", "hoogte van de nok", "nok van het gebouw"
    nokhoogte: { name: String.raw`nokhoogte|hoogte van de nok|nok\b`, unit: METRES },
    // "dakhelling … tussen 30° en 60°", "hellingshoek van 45 graden"
    dakhelling: { name: String.raw`dakhelling|hellingshoek|helling van het dak|dakvlakken?\s+onder een hoek`, unit: DEGREES },
};
function parseNlNumber(s) {
    const t = String(s).replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
    const n = Number.parseFloat(t);
    return Number.isFinite(n) ? n : null;
}
function detect(text, spec) {
    const re = new RegExp(String.raw`\b(?:${spec.name})\b`, 'gi');
    const unitRe = new RegExp(spec.unit, 'gi');
    const hits = [];
    let m;
    while ((m = re.exec(text)) !== null) {
        const win = text.slice(m.index, m.index + 120);
        unitRe.lastIndex = 0;
        const nums = [];
        let c;
        while ((c = unitRe.exec(win)) !== null) {
            const n = parseNlNumber(c[1]);
            if (n !== null) nums.push(n);
        }
        if (nums.length === 0) continue;
        hits.push({
            offset: m.index,
            numbers: nums,
            // VERBATIM — signed or rejected by a human, never paraphrased.
            verbatim: text.slice(Math.max(0, m.index - 90), m.index + 170),
        });
        if (hits.length >= 40) break;
    }
    return hits;
}

/**
 * Bin a plan into the runtime's own `NlRoofBoundType` vocabulary, from what its TEXT sets.
 * ⚠ `nok` OR `dakhelling` closes the section; `goot` alone does not; `bouwhoogte` alone is a prism.
 */
function boundTypeFromText(has) {
    const goot = has.goothoogte, bouw = has.bouwhoogte, nok = has.nokhoogte, helling = has.dakhelling;
    if (goot && (nok || helling)) return nok ? 'closed-by-ridge' : 'section-closed-by-pitch';
    if (goot && bouw) return 'roof-zone-slab';
    if (goot) return 'eaves-plane-no-top';
    if (bouw || nok) return 'prism-upper-bound';
    return 'none';
}

async function processPlan(p) {
    const res = await fetchRules(p.candidates);
    const base = {
        planId: p.planId, naam: p.naam, naamoverheid: p.naamoverheid, typeplan: p.typeplan,
        datum: p.datum, dossierstatus: p.dossierstatus, nParcels: p.nParcels,
        hoofdgroepen: [...p.hoofdgroepen].sort(),
    };
    if (!res.ok) return { ...base, fetch: 'FAIL', tried: res.tried };
    const found = {};
    for (const [k, spec] of Object.entries(PARAMS)) found[k] = detect(res.text, spec);
    const has = Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.length > 0]));
    return {
        ...base, fetch: 'OK', resolvedVia: res.url, textChars: res.text.length,
        has,
        counts: Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.length])),
        numbers: Object.fromEntries(Object.entries(found).map(([k, v]) => [k, [...new Set(v.flatMap((h) => h.numbers))].sort((a, b) => a - b).slice(0, 12)])),
        boundTypeFromText: boundTypeFromText(has),
        samples: Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.slice(0, 2).map((h) => h.verbatim)])),
    };
}

const results = [];
let idx = 0;
async function worker() {
    while (idx < chosen.length) {
        const p = chosen[idx++];
        results.push(await processPlan(p));
        process.stderr.write(`  ... ${results.length}/${chosen.length}\n`);
        await new Promise((r) => setTimeout(r, 400));
    }
}
const t0 = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
results.sort((a, b) => a.planId.localeCompare(b.planId));

// ── 4. reduce — the shares, and the CO-OCCURRENCE the founder actually asked for ──────────────
const ok = results.filter((r) => r.fetch === 'OK');
const pct = (n) => (ok.length ? `${n}/${ok.length} = ${(100 * n / ok.length).toFixed(1)}%` : 'n/a');
const share = {};
for (const k of Object.keys(PARAMS)) share[k] = pct(ok.filter((r) => r.has[k]).length);
const coOccurrence = {
    'goothoogte AND dakhelling': pct(ok.filter((r) => r.has.goothoogte && r.has.dakhelling).length),
    'goothoogte AND nokhoogte': pct(ok.filter((r) => r.has.goothoogte && r.has.nokhoogte).length),
    'goothoogte AND (nokhoogte OR dakhelling)': pct(ok.filter((r) => r.has.goothoogte && (r.has.nokhoogte || r.has.dakhelling)).length),
    'nokhoogte AND dakhelling': pct(ok.filter((r) => r.has.nokhoogte && r.has.dakhelling).length),
    'goothoogte AND bouwhoogte, no nok and no helling': pct(ok.filter((r) => r.has.goothoogte && r.has.bouwhoogte && !r.has.nokhoogte && !r.has.dakhelling).length),
    'none of the four': pct(ok.filter((r) => !r.has.goothoogte && !r.has.bouwhoogte && !r.has.nokhoogte && !r.has.dakhelling).length),
};
const boundTypeHistogram = {};
for (const r of ok) boundTypeHistogram[r.boundTypeFromText] = (boundTypeHistogram[r.boundTypeFromText] ?? 0) + 1;

const summary = {
    requested: chosen.length, fetched: ok.length, fetchFailed: results.length - ok.length,
    shareOfFetchedPlans: share,
    coOccurrence,
    boundTypeHistogram,
};
process.stderr.write('\n' + JSON.stringify(summary, null, 1) + '\n');

fs.writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    lane: 'ENVELOPE-NLDK round 4',
    spec: 'NL-FOUNDER-BLOCKER-REVIEW.md §5 — "Measure nokhoogte in TEXT too … if it tracks dakhelling, the two together close a lot of triangles"',
    source: 'ruimtelijkeplannen.nl/documents/<planId>/r_<planId>.html (KEYLESS), via WMS `verwijzingnaartekst`',
    samples: SAMPLES, seed: SEED, requested: N,
    distinctGoverningPlans: all.length,
    unit: 'PER PLAN, not per parcel — a plan naming a parameter somewhere does not set it for every bestemming, so these are UPPER BOUNDS on the parcel-level share',
    detector: 'parameter NAME followed within 120 chars by a number in its own unit (m / ° ). A begripsbepaling with no number is deliberately NOT a hit. Windows stored VERBATIM.',
    boundTypeRule: 'the runtime vocabulary NlRoofBoundType: goot+(nok|helling) closes the section; goot+bouw = roof-zone-slab; goot alone = eaves-plane-no-top; bouw|nok alone = prism-upper-bound; else none',
    // ⚠ READ THESE BEFORE QUOTING A SHARE. Found by reading the VERBATIM windows this run produced,
    // not predicted by the author — which is why they are here rather than in a commit message.
    knownDetectorLimitations: [
        'A BEGRIPSBEPALING THAT CARRIES NUMBERS IS COUNTED. e.g. NL.IMRO.0606.BP00100-0002 hits on that plan’s own definition ' +
            'of `kap` ("1.88 … met een dakhelling van ten minste 30° en ten hoogste 60°"), which DEFINES the word rather than ' +
            'setting the pitch for any bestemming. So `dakhelling` here is an UPPER BOUND on the share of plans that SET a pitch.',
        'A RELATIVE CONSTRAINT ON THE NOK IS COUNTED AS A NOKHOOGTE. e.g. NL.IMRO.1884.PPALGEMAFWIJKINGEN-VAS1 hits on a ' +
            'dakkapel rule ("minimaal 0,5 m onder de nokhoogte van de dakopbouw") — a relation to a ridge, not a ridge height. ' +
            'So `nokhoogte` is likewise an UPPER BOUND, and its measured share is already small.',
        'PER PLAN, NOT PER BESTEMMING. A plan that sets a goothoogte for `Wonen` and nothing for `Bedrijf` counts once. The ' +
            'parcel-level share is therefore ≤ every figure here.',
        'THE dakhelling SHARE IS NOT COMPARABLE TO PHASE 0’S 28.8 %. Phase 0 used a different sample and a token-presence ' +
            'detector; this one REQUIRES a number in degrees within 120 chars. A lower number here is a stricter detector, ' +
            'NOT a corrected measurement — do not report it as a correction.',
    ],
    elapsedSec: Math.round((Date.now() - t0) / 1000),
    summary,
    results,
}, null, 1));
process.stderr.write(`\nWROTE ${OUT} — ${results.length} plans\n`);
