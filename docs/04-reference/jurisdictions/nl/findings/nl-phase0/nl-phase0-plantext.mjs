#!/usr/bin/env node
// NL PHASE 0 — HARNESS B: plan REGELS text -> M4 (peil), M5b (roof determinacy), and the
// §7.8 discretionary / §5D voorrang / §7.2 denominator / §8 vergunningvrij census.
//
// Lane ENVELOPE-NLDK, 2026-09-03.
//
// ⭐ THE BLOCKER THIS DELETES. `NL-DATA-GAP-AUDIT.md` §3 records M4 as "NO — new ingestion …
// Requires plan `regels`/begripsbepaling TEXT, which the WMS does not serve. Route: DSO key
// (#1)". That is FALSE, and this harness is the disproof. The PDOK RP WMS `bestemmingsplangebied`
// feature carries a property `verwijzingnaartekst` whose value is a KEYLESS, public URL to the
// plan's IMROPT2012 objectgerichte-tekst document:
//
//     https://ruimtelijkeplannen.nl/documents/<planId>/pt_<planId>.xml#NL.IMRO.PT.sNN
//
// Probed live 2026-09-03 on NL.IMRO.0363.GA2102PBPGST-VG02 -> HTTP 200, 159 735 bytes,
// containing article "1.17 Peil" with the verbatim begripsbepaling. NO DSO API KEY IS INVOLVED.
// M4 is therefore measurable TODAY, and so is every text-borne axis below.
//
// (The DSO key is still needed for M6's IMOW half — re-probed 2026-09-03, every Ozon
// Presenteren v8 data path including /app-info and /crss returns HTTP 401 "Inloggegevens
// ontbreken". That refusal is real; the M4 one was not.)
//
// USAGE:
//   node nl-phase0-plantext.mjs --sample=nl-phase0-sample-land.json,nl-phase0-sample-urban.json \
//        --n=50 --seed=20260903 --out=nl-phase0-plantext.json
//
// HONESTY: this harness EXTRACTS and COUNTS. It does not interpret. A `peil` definition it
// captures is stored VERBATIM with its plan id and the character offset it came from, so a human
// signs the clustering (master §1 "extraction runs once, is human-signed"). Nothing here is
// permitted to become a rule without that signature.

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), 'true'];
}));
const SAMPLES = String(args.sample ?? 'nl-phase0-sample-land.json').split(',').map((s) => s.trim()).filter(Boolean);
const N = Number(args.n ?? 50);
const SEED = Number(args.seed ?? 20260903);
const OUT = args.out ?? 'nl-phase0-plantext.json';
const CONCURRENCY = Number(args.concurrency ?? 4);

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

// -- collect distinct governing plans from the parcel samples --------------------------------
const plans = new Map(); // planId -> { planId, textUrl, versieimro, typeplan, datum, status, nParcels }
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
        if (!best) continue;
        const p = best.p;
        const planId = p.plangebied || p.identificatie || p.dossierid;
        if (!planId) continue;
        // `verwijzingnaartekst` is a COMMA-SEPARATED LIST of document URLs of several KINDS, and
        // the first one is usually NOT the rules:
        //   r_<planId>.html / .xml  — de REGELS (what an envelope engine needs)
        //   pt_<planId>.xml         — de objectgerichte tekst (IMROPT2012; also the regels)
        //   b_<planId>_rb.html      — bijlage bij de REGELS (an annex, not the rules)
        //   b_<planId>_tb.html      — bijlage bij de TOELICHTING (explanatory memorandum annex)
        //   rb_<planId>_index.html  — an index stub of a few hundred bytes
        // Taking [0] blindly reads annexes and index stubs as if they were the rules. The
        // candidate list below prefers r_/pt_ from the PUBLISHED list, and only then falls back
        // to the r_/pt_ naming CONSTRUCTED from the plan id — a construction, so it is tried and
        // RECORDED (`resolvedVia`), never assumed.
        const raw = String(p.verwijzingnaartekst ?? '');
        const listed = raw.split(',').map((u) => u.split('#')[0].trim()).filter(Boolean)
            .map((u) => u.replace(/^http:\/\//, 'https://'));
        const isRules = (u) => /\/(r|pt)_[^/]*$/i.test(u);
        const candidates = [
            ...listed.filter(isRules),
            'https://ruimtelijkeplannen.nl/documents/' + planId + '/r_' + planId + '.html',
            'https://ruimtelijkeplannen.nl/documents/' + planId + '/pt_' + planId + '.xml',
            'https://ruimtelijkeplannen.nl/documents/' + planId + '/r_' + planId + '.xml',
            ...listed.filter((u) => !isRules(u)),
        ].filter((v, i, a) => a.indexOf(v) === i);
        const prev = plans.get(planId);
        if (prev) { prev.nParcels++; continue; }
        plans.set(planId, {
            planId,
            candidates,
            textUrl: candidates[0] ?? null,
            versieimro: p.versieimro ?? null,
            typeplan: p.typeplan ?? null,
            datum: p.datum ?? null,
            dossierstatus: p.dossierstatus ?? null,
            naamoverheid: p.naamoverheid ?? null,
            overheidscode: p.overheidscode ?? null,
            nParcels: 1,
        });
    }
}
const all = [...plans.values()].sort((a, b) => a.planId.localeCompare(b.planId));
const withText = all.filter((p) => p.textUrl);
process.stderr.write('distinct governing plans: ' + all.length + ' | with a plan-text URL: ' + withText.length + '\n');

// Deterministic draw of N plans from those that publish a text URL.
const pool = withText.slice();
const chosen = [];
while (chosen.length < Math.min(N, pool.length)) chosen.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);

// -- text fetch + flatten ---------------------------------------------------------------------
// ruimtelijkeplannen.nl throttles. The FIRST version of this harness ran 6 workers x 6 candidate
// URLs and recorded 33/60 "exhausted" — which is a RATE LIMIT, not an absent document (the same
// plan id had fetched fine at lower load minutes earlier). Reporting a throttle as "no plan text
// published" would be the same class of error as reporting a 404 as "no data". So: 2 workers,
// long backoff, an inter-request pause, and the LAST HTTP STATUS is carried into the record.
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
        await new Promise((res) => setTimeout(res, 1200 * Math.pow(2, i)));
    }
    return { ok: false, error: 'retries-exhausted-last=' + last };
}
function flatten(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&#160;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// -- M4: the `peil` begripsbepaling ----------------------------------------------------------
// A DEFINITION, not a mention. The IMROPT2012 begrippen article numbers its entries `1.NN`.
// The table of contents repeats those headings, so a candidate whose capture runs straight into
// another numbered heading within 40 chars is discarded as a TOC row. The LONGEST surviving
// capture is taken, trimmed at the next heading. VERBATIM — never paraphrased.
function extractPeil(text) {
    const out = [];
    const re = /(\d+\.\d+)\s+([Pp]eil)\b/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const after = text.slice(m.index + m[0].length, m.index + m[0].length + 2000);
        if (/^\s*\d+\.\d+\s+\S/.test(after.slice(0, 40)) || /^\s*Artikel\s+\d/.test(after.slice(0, 40))) continue;
        const stop = after.search(/\s(?:Artikel\s+\d|\d+\.\d+\s+[A-Z])/);
        const body = (stop > 0 ? after.slice(0, stop) : after).trim();
        if (body.length < 10) continue;
        out.push({ heading: m[1] + ' ' + m[2], offset: m.index, text: body.slice(0, 1200) });
    }
    out.sort((a, b) => b.text.length - a.text.length);
    return out[0] ?? null;
}

/**
 * Classify a captured peil definition into the PHYSICAL REFERENCE it points at. The classes are
 * disjoint families of physical evidence, NOT a legal interpretation — a definition can name
 * several, in which case every match is recorded. `unclassified` is a first-class outcome and is
 * NEVER silently folded into `maaiveld`: that fold is exactly the "peil = AHN elevation"
 * hard-code the master prompt §7.1 forbids.
 */
function classifyPeil(text) {
    // ⚠ CORRECTED 2026-09-04 (lane ENVELOPE-NLDK, round 2) — the original regex required the UNINFLECTED
    // "aansluitend afgewerkt maaiveld". Dutch legal prose overwhelmingly writes the INFLECTED
    // "aansluitende afgewerkte maaiveld", so this class was detected on 1 of 20 plans when the
    // true figure is 11. Caught by nlPeil.test.ts, re-reduced offline from the stored texts.
    // ⚠ CORRECTED AGAIN 2026-09-04 (round 3) — QUOTING the 18 distinct definitions into a catalogue
    // (`rulepacks/nlPeilCatalogue.ts`) exposed four more misses of the same family: a COMMA between the
    // adjectives ("aansluitende, afgewerkte" — 0717, 1509), the synonyms "aanliggend afgewerkt terrein" /
    // "afgewerkte bouwterrein" (1896, 0820), words between "kruin van de" and "weg" (0148), and one
    // OVER-match — "maaiveld vóór het bouwrijp maken" is the ground BEFORE construction (0148), so it is
    // neutralised into `maaiveld-other`. Also: "Nieuw Amsterdams Peil", "hoofdingang", water synonyms,
    // "bovenzijde vloer"/"vloerpeil", "door het waterschap". KEPT IDENTICAL to `classifyNlPeilDefinition`
    // in `rulepacks/nlPeil.ts` — if the two disagree, the coverage figures stop describing the runtime.
    const s = text.toLowerCase().replace(/aansluitende?\s+(afgewerkte?\s+)?maaiveld\s+v[oó]{2}r\s+het\s+bouwrijp\s+maken/g, 'maaiveld-voor-bouwrijp-maken');
    const hits = [];
    if (/kruin van de[^.;:]{0,40}?\bweg\b|kruin van de aangrenzende|wegdek/.test(s)) hits.push('road-crown');
    if (/(aansluitende?|aanliggende?),?\s+(afgewerkte?,?\s+)?(maaiveld|terrein)|afgewerkte?,?\s+(aansluitende?|aanliggende?)\s+(maaiveld|terrein)|gemiddelde hoogte van het\s+((aansluitende?|aanliggende?),?\s+)?(afgewerkte?,?\s+)?(terrein|maaiveld)|afgewerkte?\s+bouwterrein/.test(s)) hits.push('adjoining-finished-ground');
    if (/\bmaaiveld\b/.test(s) && !hits.includes('adjoining-finished-ground')) hits.push('maaiveld-other');
    if (/\bn\.?a\.?p\.?\b|normaal amsterdams peil|nieuw amsterdams peil/.test(s)) hits.push('nap-absolute');
    if (/hoofdtoegang|hoofdingang|toegang van het gebouw|entree/.test(s)) hits.push('main-entrance-referenced');
    if (/bovenkant.*(afgewerkte )?vloer|begane[- ]grondvloer|bovenzijde vloer|vloerpeil/.test(s)) hits.push('ground-floor-level');
    if (/dijk|kade|waterpeil|waterstand|boezempeil|waterspiegel|waterniveau|waterlijn|oevers/.test(s)) hits.push('water-or-dike');
    if (/burgemeester en wethouders?|bevoegd gezag|nader.{0,20}bepaal|door het waterschap/.test(s)) hits.push('authority-determined');
    if (hits.length === 0) hits.push('unclassified');
    return hits;
}

// -- the text census --------------------------------------------------------------------------
const TERMS = {
    // M5b — roof-form rules. Two limits are not a roof; these are the rules that could make one.
    roof_dakhelling: /\bdakhelling(en)?\b/i,
    roof_nokhoogte: /\bnokhoogte\b/i,
    roof_nokrichting: /\bnokrichting\b/i,
    roof_kap: /\b(kap|kapvorm|kapconstructie|afgedekt met een kap)\b/i,
    roof_platdak: /\bplat(te)? dak(en)?\b/i,
    roof_dakvorm: /\bdakvorm\b/i,
    roof_dakopbouw: /\bdakopbouw\b/i,
    roof_dakkapel: /\bdakkapel(len)?\b/i,
    roof_mansarde: /\bmansarde\b/i,
    // §7.5 — the cubic constraint.
    inhoud_constraint: /\binhoud\b[^.]{0,80}\b(m3|m³|kubieke|bedra|maxim)/i,
    inhoud_word: /\binhoud\b/i,
    // §7.2 — the bebouwingspercentage denominator.
    bebpct_word: /\bbebouwingspercentage\b/i,
    bebpct_of_bouwvlak: /bebouwingspercentage[^.]{0,120}\bbouwvlak\b/i,
    bebpct_of_perceel: /bebouwingspercentage[^.]{0,120}\b(bouwperceel|perceel)\b/i,
    bebpct_of_bestemmingsvlak: /bebouwingspercentage[^.]{0,120}\bbestemmingsvlak\b/i,
    // §7.8 — discretionary / conditional. NEVER silently converted into a right.
    disc_afwijking: /\bafwijk(en|ing|ingsbevoegdheid)\b/i,
    disc_nadere_eisen: /\bnadere eisen\b/i,
    disc_bevoegd_gezag: /\bbevoegd gezag\b/i,
    disc_bw: /\bburgemeester en wethouders\b/i,
    disc_mits: /\bmits\b/i,
    disc_wijzigingsbevoegdheid: /\bwijzigingsbevoegdheid\b/i,
    disc_overgangsrecht: /\bovergangsrecht\b/i,
    disc_maatwerk: /\bmaatwerkvoorschrift(en)?\b/i,
    // §5D — precedence as its own operation.
    voorrang: /\bvoorrang\b/i,
    voorrangsregeling: /\bvoorrangsregeling\b/i,
    // §8 — the permit-free layer and its carve-outs.
    vergunningvrij: /\bvergunningvrij\b/i,
    achtererfgebied: /\bachtererfgebied\b/i,
    bebouwingsgebied: /\bbebouwingsgebied\b/i,
    monument: /\bmonument(en|aal)?\b/i,
    beschermd_stadsgezicht: /\bbeschermd (stads|dorps)gezicht\b/i,
    bijbehorend_bouwwerk: /\bbijbehorend[e]? bouwwerk(en)?\b/i,
    // §7.6 — the inclined-plane operator family.
    molenbiotoop: /\bmolenbiotoop\b/i,
    // §7.3 — building outside the bouwvlak.
    buiten_bouwvlak: /buiten het bouwvlak/i,
    // §7.1 — peil vocabulary presence (independent of a successful definition capture).
    peil_word: /\bpeil\b/i,
};

/**
 * Try each candidate in order; accept the first that returns 200 with a document big enough to
 * BE a set of rules. `MIN_RULES_CHARS` exists because index stubs return 200 at ~400 chars and
 * scoring them as "fetched, no peil definition" would understate M4 by counting a document that
 * was never the rules. A too-small document is recorded as `TOO-SMALL`, never as an absence.
 */
const MIN_RULES_CHARS = 3000;
async function fetchRules(cands) {
    const tried = [];
    for (const u of cands.slice(0, 6)) {
        const res = await fetchText(u);
        if (!res.ok) { tried.push(u + ' -> ' + res.error); continue; }
        const text = flatten(res.body);
        if (text.length < MIN_RULES_CHARS) { tried.push(u + ' -> TOO-SMALL(' + text.length + ')'); continue; }
        return { ok: true, url: u, body: res.body, text, tried };
    }
    return { ok: false, tried };
}

async function processPlan(p) {
    const res = await fetchRules(p.candidates ?? [p.textUrl]);
    if (!res.ok) return { ...p, candidates: undefined, fetch: 'FAIL', tried: res.tried };
    const text = res.text;
    const peil = extractPeil(text);
    const terms = {};
    for (const [k, re] of Object.entries(TERMS)) terms[k] = re.test(text);
    return {
        ...p,
        candidates: undefined,
        fetch: 'OK',
        resolvedVia: res.url,
        triedBefore: res.tried,
        bytes: res.body.length,
        textChars: text.length,
        peilDefinition: peil ? peil.text : null,
        peilHeading: peil ? peil.heading : null,
        peilClasses: peil ? classifyPeil(peil.text) : null,
        terms,
    };
}

const results = [];
let idx = 0;
async function worker() {
    while (idx < chosen.length) {
        const p = chosen[idx++];
        results.push(await processPlan(p));
        process.stderr.write('  ... ' + results.length + '/' + chosen.length + '\n');
    }
}
const t0 = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
results.sort((a, b) => a.planId.localeCompare(b.planId));

fs.writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    lane: 'ENVELOPE-NLDK',
    spec: 'NL-ENVELOPE-MASTER-PROMPT.md §2 M4 + M5b; §7.2/§7.5/§7.8/§5D/§8 census',
    source: 'ruimtelijkeplannen.nl/documents/<planId>/pt_<planId>.xml — KEYLESS, from the WMS property `verwijzingnaartekst`',
    samples: SAMPLES,
    distinctGoverningPlans: all.length,
    plansWithTextUrl: withText.length,
    requested: N, fetched: results.length,
    seed: SEED,
    elapsedSec: Math.round((Date.now() - t0) / 1000),
    results,
}, null, 1));
process.stderr.write('\nWROTE ' + OUT + ' — ' + results.length + ' plans\n');
