#!/usr/bin/env node
// NL — the `inhoud` TARGETED PROBE (founder review §6, move 4). Lane ENVELOPE-NLDK, 2026-09-04.
//
// THE QUESTION. Phase 0 reported `inhoud` (the cubic-metre volume cap) at 0 of 556 parcels in the
// STRUCTURED SVBP2012 maatvoering, and the completion doc labelled it `missing-source`. The founder
// disputes the label: `inhoud hoofdgebouw maximaal 650 m³` is a real and common Dutch construction,
// but characteristically a RURAL / buitengebied rule, so a tile- or parcel-uniform national sample
// can miss it while it stays routine where it appears. Before concluding absence, probe plans over
// agrarisch / wonen-in-buitengebied parcels SPECIFICALLY, and compare against a control stratum.
//
// WHAT THIS HARNESS DOES — it EXTRACTS and COUNTS; it does not interpret.
//   1. Collect the governing plans from the Phase 0 parcel samples (same status-rank rule as the
//      other harnesses), remembering which enkelbestemming hoofdgroepen sit under each plan.
//   2. Stratify plans: `buitengebied` = the plan naam says buitengebied / landelijk gebied, OR a
//      sampled parcel under it carries an `agrarisch*` hoofdgroep. `control` = everything else.
//   3. Draw N from each stratum (seeded), fetch the REGELS text via the KEYLESS ruimtelijkeplannen.nl
//      document URL (the route Harness B proved), flatten to text.
//   4. Extract every VERBATIM window in which `inhoud` is followed within 160 chars by a number and
//      a cubic-metre unit (m³ / m3 / kubieke meter). Record the numbers, the window, and the nearest
//      preceding "Artikel N <Bestemming>" heading, so a reader can see WHICH bestemming the cap sits
//      under (Agrarisch, Wonen, …). Windows are stored verbatim — fixtures are QUOTED from the
//      sample, never written by the regex's author (lane rule, after the 10× `peil` bug).
//   5. Report per stratum: plans fetched, plans with ≥1 cubic-metre inhoud rule, the histogram of
//      the numbers, and the bestemming contexts. Failures (throttle / 404 / too-small) are counted
//      SEPARATELY and never as "no rule".
//
// USAGE:
//   node nl-inhoud-probe.mjs --sample=nl-phase0-sample-land.json,nl-phase0-sample-urban.json \
//        --n=40 --seed=20260903 --out=nl-inhoud-probe.json
//
// ⚠ The regex is a DETECTOR, not a legal reading. A window that says "de inhoud van een woning mag
// niet meer bedragen dan 750 m³" is a volume cap; a window about "inhoud van het plan" carries no
// m³ and is not captured. What is captured is stored verbatim precisely so a human can sign or
// reject each window (master §1 — extraction runs once, is human-signed).

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), 'true'];
}));
const SAMPLES = String(args.sample ?? 'nl-phase0-sample-land.json,nl-phase0-sample-urban.json')
    .split(',').map((s) => s.trim()).filter(Boolean);
const N = Number(args.n ?? 40);
const SEED = Number(args.seed ?? 20260903);
const OUT = args.out ?? 'nl-inhoud-probe.json';
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

// ── 1. collect governing plans + the hoofdgroepen under them ─────────────────────────────────
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
        const names = (row.layers?.enkelbestemming ?? []).map((e) => String(e.naam ?? '')).filter(Boolean);
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
        if (prev) {
            prev.nParcels++;
            for (const g of groups) prev.hoofdgroepen.add(g);
            for (const n of names) prev.bestemmingen.add(n);
            continue;
        }
        plans.set(planId, {
            planId, candidates,
            naam: p.naam ?? null, naamoverheid: p.naamoverheid ?? null, typeplan: p.typeplan ?? null,
            datum: p.datum ?? null, dossierstatus: p.dossierstatus ?? null,
            hoofdgroepen: new Set(groups), bestemmingen: new Set(names), nParcels: 1,
        });
    }
}

// ── 2. stratify ──────────────────────────────────────────────────────────────────────────────
function isBuitengebied(p) {
    if (/buitengebied|landelijk gebied|landelijkgebied/i.test(String(p.naam ?? ''))) return true;
    for (const g of p.hoofdgroepen) if (g.startsWith('agrarisch')) return true;
    return false;
}
const all = [...plans.values()].sort((a, b) => a.planId.localeCompare(b.planId));
const strata = { buitengebied: all.filter(isBuitengebied), control: all.filter((p) => !isBuitengebied(p)) };
process.stderr.write(`distinct governing plans: ${all.length} | buitengebied ${strata.buitengebied.length} | control ${strata.control.length}\n`);

function draw(pool, n) {
    const src = pool.slice(); const out = [];
    while (out.length < Math.min(n, src.length)) out.push(src.splice(Math.floor(rnd() * src.length), 1)[0]);
    return out;
}
const chosen = [
    ...draw(strata.buitengebied, N).map((p) => ({ ...p, stratum: 'buitengebied' })),
    ...draw(strata.control, N).map((p) => ({ ...p, stratum: 'control' })),
];

// ── 3. fetch (2 workers, long backoff — ruimtelijkeplannen.nl throttles; a throttle is not an absence) ──
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
        .replace(/&sup3;/gi, '³').replace(/&#179;/g, '³')
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

// ── 4. extraction — verbatim windows, the numbers, the bestemming context ─────────────────────
// A cubic-metre figure: "650 m³", "650 m3", "650m³", "1.000 m³", "750 kubieke meter".
const CUBIC = /(\d{1,3}(?:[.,]\d{3})*(?:,\d+)?)\s*(m³|m3|m&sup3;|kubieke meter[s]?)/gi;
function parseNlNumber(s) {
    // Dutch thousands separator "." and decimal ","; "1.000" → 1000; "12,5" → 12.5
    const t = s.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
    const n = Number.parseFloat(t);
    return Number.isFinite(n) ? n : null;
}
function extractInhoud(text) {
    const out = [];
    const re = /\binhoud\b/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
        const win = text.slice(m.index, m.index + 160);
        const nums = [];
        let c;
        CUBIC.lastIndex = 0;
        while ((c = CUBIC.exec(win)) !== null) {
            const n = parseNlNumber(c[1]);
            if (n !== null) nums.push(n);
        }
        if (nums.length === 0) continue;
        // Nearest preceding bestemming heading: "Artikel 3 Agrarisch", "Artikel 15 Wonen".
        const before = text.slice(Math.max(0, m.index - 30000), m.index);
        const heads = [...before.matchAll(/Artikel\s+(\d+)\s+([A-Z][A-Za-z\- ]{2,40}?)(?=\s+\d+\.\d+|\s+Artikel|\s+[a-z])/g)];
        const last = heads.length ? heads[heads.length - 1] : null;
        const verbatim = text.slice(Math.max(0, m.index - 120), m.index + 200);
        const maximal = /maxim|ten hoogste|niet meer (dan|bedragen)|mag niet|bedraagt/i.test(verbatim);
        out.push({
            offset: m.index,
            numbersM3: nums,
            maximalPhrasing: maximal,
            articleContext: last ? `Artikel ${last[1]} ${last[2].trim()}` : null,
            verbatim,
        });
    }
    return out;
}
const isWonenCtx = (a) => /\bwonen\b|woon/i.test(String(a ?? ''));
const isAgrCtx = (a) => /agrarisch/i.test(String(a ?? ''));

// ── 4b. the `bebouwingspercentage` BEGRIPSBEPALING, verbatim (founder review §7 / move 3) ─────
// The denominator (bouwvlak vs bouwperceel vs bestemmingsvlak) lives in the plan's definition
// article "1.NN bebouwingspercentage: een in de regels aangegeven percentage, dat de grootte van
// het deel van het BOUWVLAK/BOUWPERCEEL aangeeft dat maximaal mag worden bebouwd". Captured
// VERBATIM with the same TOC-row guard as Harness B's peil extractor, and classified into the
// three denominators by keyword — recorded as a SET, because a definition can name two.
function extractDefinition(text, term) {
    const out = [];
    const re = new RegExp('(\\d+\\.\\d+)\\s+(' + term + ')\\b', 'gi');
    let m;
    while ((m = re.exec(text)) !== null) {
        const after = text.slice(m.index + m[0].length, m.index + m[0].length + 1200);
        if (/^\s*\d+\.\d+\s+\S/.test(after.slice(0, 40)) || /^\s*Artikel\s+\d/.test(after.slice(0, 40))) continue;
        const stop = after.search(/\s(?:Artikel\s+\d|\d+\.\d+\s+[A-Za-z])/);
        const body = (stop > 0 ? after.slice(0, stop) : after).trim();
        if (body.length < 10) continue;
        out.push({ heading: m[1] + ' ' + m[2], offset: m.index, text: body.slice(0, 700) });
    }
    out.sort((a, b) => b.text.length - a.text.length);
    return out[0] ?? null;
}
function classifyBebpctDenominator(defText) {
    const s = String(defText ?? '').toLowerCase();
    const hits = [];
    if (/\bbouwvlak(ken)?\b/.test(s)) hits.push('bouwvlak');
    if (/\bbouwperce(e)?l(en)?\b/.test(s)) hits.push('bouwperceel');
    if (/\bbestemmingsvlak(ken)?\b/.test(s)) hits.push('bestemmingsvlak');
    if (/\b(?<!bouw)perce(e)?l\b/.test(s) && !hits.includes('bouwperceel')) hits.push('perceel-unqualified');
    if (hits.length === 0) hits.push('unclassified');
    return hits;
}

async function processPlan(p) {
    const res = await fetchRules(p.candidates);
    const base = {
        planId: p.planId, stratum: p.stratum, naam: p.naam, naamoverheid: p.naamoverheid, typeplan: p.typeplan,
        datum: p.datum, dossierstatus: p.dossierstatus, nParcels: p.nParcels,
        hoofdgroepen: [...p.hoofdgroepen].sort(), bestemmingen: [...p.bestemmingen].sort(),
    };
    if (!res.ok) return { ...base, fetch: 'FAIL', tried: res.tried };
    const hits = extractInhoud(res.text);
    const bebDef = extractDefinition(res.text, 'bebouwingspercentage');
    return {
        ...base, fetch: 'OK', resolvedVia: res.url, textChars: res.text.length,
        bebouwingspercentageDefinition: bebDef ? bebDef.text : null,
        bebouwingspercentageDenominatorClasses: bebDef ? classifyBebpctDenominator(bebDef.text) : null,
        inhoudCubicRuleCount: hits.length,
        inhoudNumbersM3: [...new Set(hits.flatMap((h) => h.numbersM3))].sort((a, b) => a - b),
        anyWonenContext: hits.some((h) => isWonenCtx(h.articleContext) || /woning|wonen/i.test(h.verbatim)),
        anyAgrarischContext: hits.some((h) => isAgrCtx(h.articleContext) || /agrarisch|bedrijfswoning/i.test(h.verbatim)),
        hits: hits.slice(0, 12),
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

// ── 5. reduce ────────────────────────────────────────────────────────────────────────────────
function summarise(stratum) {
    const rows = results.filter((r) => r.stratum === stratum);
    const ok = rows.filter((r) => r.fetch === 'OK');
    const withRule = ok.filter((r) => r.inhoudCubicRuleCount > 0);
    const hist = {};
    for (const r of withRule) for (const n of r.inhoudNumbersM3) hist[String(n)] = (hist[String(n)] ?? 0) + 1;
    const withBebDef = ok.filter((r) => r.bebouwingspercentageDefinition);
    const denomHist = {};
    for (const r of withBebDef) denomHist[r.bebouwingspercentageDenominatorClasses.join('+')] = (denomHist[r.bebouwingspercentageDenominatorClasses.join('+')] ?? 0) + 1;
    return {
        requested: rows.length, fetched: ok.length, fetchFailed: rows.length - ok.length,
        plansWithBebouwingspercentageDefinition: withBebDef.length,
        bebouwingspercentageDenominatorHistogram: denomHist,
        plansWithCubicInhoudRule: withRule.length,
        share: ok.length ? `${withRule.length}/${ok.length} = ${(100 * withRule.length / ok.length).toFixed(1)}%` : 'n/a (nothing fetched)',
        plansWithWonenContext: withRule.filter((r) => r.anyWonenContext).length,
        plansWithAgrarischContext: withRule.filter((r) => r.anyAgrarischContext).length,
        numberHistogramM3: Object.fromEntries(Object.entries(hist).sort((a, b) => Number(a[0]) - Number(b[0]))),
    };
}
const summary = { buitengebied: summarise('buitengebied'), control: summarise('control') };
process.stderr.write('\n' + JSON.stringify(summary, null, 1) + '\n');

fs.writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    lane: 'ENVELOPE-NLDK',
    spec: 'NL-FOUNDER-BLOCKER-REVIEW.md §6 / §10 move 4 — inhoud targeted probe, buitengebied vs control',
    source: 'ruimtelijkeplannen.nl/documents/<planId>/r_<planId>.html (KEYLESS), via WMS `verwijzingnaartekst`',
    samples: SAMPLES, seed: SEED, requestedPerStratum: N,
    distinctGoverningPlans: all.length,
    stratumSizes: { buitengebied: strata.buitengebied.length, control: strata.control.length },
    stratificationRule: 'buitengebied := plan naam matches /buitengebied|landelijk gebied/i OR a sampled parcel under the plan has an agrarisch* hoofdgroep; control := the rest',
    detector: 'a `inhoud` token followed within 160 chars by <number> + (m³|m3|kubieke meter); windows stored VERBATIM; no interpretation',
    elapsedSec: Math.round((Date.now() - t0) / 1000),
    summary,
    results,
}, null, 1));
process.stderr.write(`\nWROTE ${OUT} — ${results.length} plans\n`);
