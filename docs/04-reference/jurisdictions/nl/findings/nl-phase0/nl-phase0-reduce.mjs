#!/usr/bin/env node
// NL PHASE 0 — REDUCER: turns the two harness artefacts into the M1-M6 report numbers.
// Lane ENVELOPE-NLDK, 2026-09-03.
//
// EVERY number printed here names its denominator and its stratum. The F1/F2 split
// (master §9) is computed SEPARATELY and never merged — merging them corrupts M1 and M3.
//
// USAGE: node nl-phase0-reduce.mjs --land=nl-phase0-sample-land.json \
//          --urban=nl-phase0-sample-urban.json --plantext=nl-phase0-plantext.json

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), 'true'];
}));
const fs = await import('node:fs');
const read = (f) => (f && fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);

const land = read(args.land ?? 'nl-phase0-sample-land.json');
const urban = read(args.urban ?? 'nl-phase0-sample-urban.json');
const ptext = read(args.plantext ?? 'nl-phase0-plantext.json');

// ── shared classifiers (mirrors of the shipped provider, plus the Phase-0 extensions) ────────
function planStatusRank(status) {
    const s = String(status ?? '').toLowerCase();
    if (s.includes('onherroepelijk')) return 4;
    if (s.includes('geconsolideerd')) return 3;
    if (s.includes('vastgesteld')) return 2;
    if (s.includes('ontwerp')) return 1;
    return 0;
}
function governing(feats) {
    let best = null;
    for (const p of feats ?? []) {
        const rank = planStatusRank(p.dossierstatus ?? p.planstatus);
        const date = String(p.datum ?? '');
        if (!best || rank > best.rank || (rank === best.rank && date > best.date)) best = { rank, date, p };
    }
    return best ? best.p : null;
}

/**
 * PRODUCTION-FAITHFUL governing-dossier pick — `pickGoverningDossier` in
 * `server/jurisdiction/nlBestemmingsplanProxy.js`. The dossier comes from the SUBSTANTIVE layers
 * (enkelbestemming / bouwvlak / maatvoering), NEVER from `bestemmingsplangebied`: a point sits
 * under many plangebied polygons and the highest-status ones are usually thematic paraplu plans
 * carrying no bouwvlak at all. Measuring with a different pick than the product ships would
 * report a number about the harness, not about the product.
 */
function governingDossier(row) {
    const bags = [
        ...(row.layers?.enkelbestemming ?? []),
        ...(row.layers?.bouwvlak ?? []),
        ...(row.layers?.maatvoering ?? []),
    ];
    let best = null;
    for (const p of bags) {
        if (!p?.dossierid) continue;
        const rank = Math.max(planStatusRank(p.dossierstatus), planStatusRank(p.planstatus));
        const datum = String(p.datum ?? '');
        if (!best || rank > best.rank || (rank === best.rank && datum > best.datum)) {
            best = { dossierid: p.dossierid, rank, datum };
        }
    }
    return best?.dossierid ?? null;
}

/**
 * PRODUCTION-FAITHFUL maatvoering set: restricted to the governing dossier and then TIED to the
 * exact bestemmingsvlak (`EP…` id) the point sits in, falling back to the whole dossier set when
 * no maatvoering carries the reference. Returns a Map kind -> value using the EXTENDED classifier
 * (the shipped one plus the kinds Phase 0 exists to count).
 */
function resolvedKinds(row, dossier) {
    const enkelForDossier = (row.layers?.enkelbestemming ?? []).filter((f) => f.dossierid === dossier);
    const bestemmingsvlakId = enkelForDossier[0]?.identificatie ?? null;
    let maat = (row.layers?.maatvoering ?? []).filter((f) => f.dossierid === dossier);
    if (bestemmingsvlakId) {
        const tied = maat.filter((f) => typeof f.bestemmingsvlak === 'string' && f.bestemmingsvlak.includes(bestemmingsvlakId));
        if (tied.length > 0) maat = tied;
    }
    const kinds = new Map();
    const shippedKinds = new Map();
    for (const f of maat) {
        const mv = parseMaat(f);
        if (!mv) continue;
        const v = readWaarde(mv.waarde);
        if (v === null) continue;
        const k = classifyExtended(mv.naam);
        if (k && !kinds.has(k)) kinds.set(k, v);
        const ks = classifyShipped(mv.naam);
        if (ks && !shippedKinds.has(ks)) shippedKinds.set(ks, v);
    }
    return { kinds, shippedKinds, bestemming: enkelForDossier[0]?.naam ?? null, hoofdgroep: (enkelForDossier[0]?.bestemmingshoofdgroep ?? '').toLowerCase() };
}
function parseMaat(props) {
    const packed = props?.maatvoering;
    const m = typeof packed === 'string' ? packed.match(/"([^"]+)"\s*=\s*"([^"]*)"/) : null;
    if (m) return { naam: m[1], waarde: m[2] };
    if (typeof props?.naam === 'string' && props.naam.trim() !== '') return { naam: props.naam, waarde: null };
    return null;
}
function readWaarde(raw) {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim().replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    const n = Number.parseFloat(s);
    return Number.isFinite(n) && n > 0 ? n : null;
}
/** SHIPPED classifier (packages/site-parcel-data/src/providers/resolveNlBestemmingsplan.ts). */
function classifyShipped(naam) {
    if (typeof naam !== 'string') return null;
    const s = naam.trim().toLowerCase();
    if (s === '') return null;
    const isMax = /\bmaxim[au]m?\b|\bmaximale\b|\bmaximum\b/.test(s);
    const isMin = /\bminimu?m?\b|\bminimale\b|\bminimum\b/.test(s);
    if (!isMax || isMin) return null;
    if (s.includes('fsi') || s.includes('vloeroppervlakteindex') || s.includes('floor space index')) return 'fsi';
    if (s.includes('bebouwingspercentage')) return 'max-bebouwingspercentage';
    if (s.includes('aantal bouwlagen')) return 'max-aantal-bouwlagen';
    if (s.includes('bouwhoogte')) return 'max-bouwhoogte';
    if (s.includes('goothoogte')) return 'max-goothoogte';
    return null;
}
/** Phase-0 EXTENSION classifier — measures the kinds the shipped one does not yet read. */
function classifyExtended(naam) {
    const shipped = classifyShipped(naam);
    if (shipped) return shipped;
    if (typeof naam !== 'string') return null;
    const s = naam.trim().toLowerCase();
    const isMax = /\bmaxim[au]m?\b|\bmaximale\b|\bmaximum\b/.test(s);
    const isMin = /\bminimu?m?\b|\bminimale\b|\bminimum\b/.test(s);
    if (!isMax || isMin) return null;
    if (s.includes('volume') || s.includes('inhoud')) return 'max-inhoud';
    if (s.includes('dakhelling')) return 'max-dakhelling';
    if (s.includes('nokhoogte')) return 'max-nokhoogte';
    if (s.includes('oppervl')) return 'max-oppervlakte';
    if (s.includes('aantal wooneenheden') || s.includes('aantal woningen')) return 'max-wooneenheden';
    return null;
}

// ── F1 vs F2, and why this reducer refuses to collapse them into one number ──────────────────
// Master §9: F1 = "plan exists but has NO envelope mechanism — a GAP"; F2 = "correct null
// (water / infrastructure) — not a gap". The founder's lane framing widens F2 to include
// "agricultural land outside any building area". Those two readings give MATERIALLY DIFFERENT
// headline numbers on Dutch data (agrarisch + agrarisch-met-waarden is ~32% of a land-uniform
// sample), and picking one silently would be exactly the corruption §9 warns about. So the
// reducer emits THREE disjoint classes and lets the reader combine them explicitly:
//   F2_WATER_INFRA_NATURE — water / verkeer / natuur / groen / bos: no building area is expected.
//   F2_AGRARIAN_OUTSIDE   — agrarisch*: the farmyard bouwvlak is elsewhere on the holding; this
//                           point is correctly null for a main building. F2 under the founder's
//                           reading, F1 under a literal reading of master §9.
//   F1_GAP                — a zone that DOES contemplate buildings (wonen, bedrijf, centrum,
//                           gemengd, maatschappelijk, sport, recreatie, overig …) where the plan
//                           publishes neither a bouwvlak nor any maatvoering. A real gap.
const F2_WATER_INFRA_NATURE = new Set(['water', 'verkeer', 'natuur', 'groen', 'bos']);
function isAgrarianHoofdgroep(h) { return /^agrarisch/.test(h); }

function classifyParcel(row) {
    const plangebied = row.layers?.bestemmingsplangebied;
    const enkel = row.layers?.enkelbestemming;
    const bvk = row.layers?.bouwvlak;
    const maat = row.layers?.maatvoering;
    const dbl = row.layers?.dubbelbestemming;
    const gba = row.layers?.gebiedsaanduiding;
    if (plangebied === null || enkel === null || bvk === null || maat === null) {
        return { status: 'E-fetch', hoofdgroep: '', note: 'upstream failure — NOT an empty answer' };
    }
    const dossier = governingDossier(row);
    if (!dossier) {
        // The product's own honest-empty branch: no SUBSTANTIVE plan feature at the point.
        // A plangebied polygon may still cover it (a paraplu plan with no zone here) — recorded,
        // because "a plan covers you but governs nothing here" and "no plan at all" differ.
        const coveredByAPlangebied = (plangebied ?? []).length > 0;
        return {
            status: 'E', hoofdgroep: '',
            note: coveredByAPlangebied
                ? 'plangebied polygon covers the point but NO substantive zone feature — the IMRO mirror serves no rule here'
                : 'no plan published at this point on the IMRO mirror',
            coveredByAPlangebied,
        };
    }
    const { kinds, shippedKinds, bestemming, hoofdgroep } = resolvedKinds(row, dossier);
    const hasBouwvlak = (bvk ?? []).some((f) => f.dossierid === dossier);
    const hasHeight = kinds.has('max-bouwhoogte');
    const hasGoot = kinds.has('max-goothoogte');
    const hasOverlay = (dbl ?? []).length > 0 || (gba ?? []).length > 0;

    if (!hasBouwvlak && kinds.size === 0) {
        const status = F2_WATER_INFRA_NATURE.has(hoofdgroep) ? 'F2_WATER_INFRA_NATURE'
            : isAgrarianHoofdgroep(hoofdgroep) ? 'F2_AGRARIAN_OUTSIDE'
                : 'F1_GAP';
        return {
            status,
            note: status === 'F1_GAP'
                ? 'plan governs a zone that contemplates buildings (hoofdgroep ' + (hoofdgroep || '(unstated)') + ') but publishes NO bouwvlak and NO maatvoering — a GAP'
                : 'correct null — hoofdgroep ' + hoofdgroep,
            plan: dossier, bestemming, hoofdgroep, hasOverlay,
        };
    }
    // An envelope mechanism exists. Determinacy:
    let status = hasBouwvlak && hasHeight ? 'A-eligible' : 'C';
    // Roof underdeterminacy: goot + bouw with no roof-form maatvoering is master §7.4's case.
    const roofUnderdetermined = hasGoot && hasHeight && !kinds.has('max-dakhelling') && !kinds.has('max-nokhoogte');
    if (roofUnderdetermined && status === 'A-eligible') status = 'C-roof';
    if (hasOverlay && status === 'A-eligible') status = 'B';
    return {
        status, plan: dossier, bestemming, hoofdgroep, hasBouwvlak, hasOverlay,
        roofUnderdetermined,
        kinds: [...kinds.keys()],
        shippedKinds: [...shippedKinds.keys()],
    };
}

function tally(list) { return list.reduce((m, k) => { m[k] = (m[k] ?? 0) + 1; return m; }, {}); }
function pct(n, d) { return d === 0 ? 'n/a' : ((100 * n) / d).toFixed(1) + '%'; }

// ── strata ────────────────────────────────────────────────────────────────────────────────────
// A cadastral "parcel" in the BRK includes multi-km2 sea and large-water lots. They are neither
// urban nor rural land and would silently distort every land statistic, so they are their own
// stratum and are reported, never dropped in silence.
function stratumOf(r) {
    const g = String(r.kadGemeente ?? '');
    if (/^(Noordzee|Waddenzee|IJsselmeer|Markermeer|Westerschelde|Oosterschelde)/i.test(g)) return 'sea-or-major-water';
    if ((r.areaM2 ?? 0) > 1_000_000) return 'sea-or-major-water';
    return r.tileParcelCount >= 15 ? 'urban(>=240 parcels/km2)' : 'rural(<240 parcels/km2)';
}

/** A bouwvlak HIT = the governing dossier publishes a bouwvlak at the point — production's own test. */
function hasGoverningBouwvlak(r) {
    const d = governingDossier(r);
    return d !== null && (r.layers?.bouwvlak ?? []).some((f) => f.dossierid === d);
}

function coverageBlock(rows) {
    const hits = rows.filter((x) => hasGoverningBouwvlak(x.r)).length;
    return { n: rows.length, bouwvlak: hits, pct: pct(hits, rows.length) };
}

function analyse(sample, label) {
    if (!sample) return null;
    const rows = sample.rows.map((r) => ({ r, c: classifyParcel(r), s: stratumOf(r) }));
    const land = rows.filter((x) => x.s !== 'sea-or-major-water');
    const hits = rows.filter((x) => hasGoverningBouwvlak(x.r));
    const landHits = land.filter((x) => hasGoverningBouwvlak(x.r));
    // Parcel-uniform (tile-size-weighted) estimator — valid only for the unfiltered stratum.
    const W = land.reduce((s, x) => s + x.r.tileParcelCount, 0);
    const Wb = landHits.reduce((s, x) => s + x.r.tileParcelCount, 0);
    const byGroup = (list, keyOf) => Object.fromEntries(Object.entries(
        list.reduce((m, x) => { (m[keyOf(x)] ??= []).push(x); return m; }, {}),
    ).map(([k, v]) => [k, coverageBlock(v)]).sort((a, b) => b[1].n - a[1].n));
    return {
        label,
        stratum: sample.stratum, seed: sample.seed,
        nSampled: rows.length,
        nDryLand: land.length,
        nSeaOrMajorWater: rows.length - land.length,
        skipped: sample.skipped, skipReasons: sample.skipReasons,
        // ⚠ THE FRAME INCLUDES TERRITORIAL WATER. The BRK cadastres the North Sea and the large
        // meres as multi-km2 lots, so a tile-uniform draw over the RD bounding box lands in them
        // often. They are reported as their own stratum and EXCLUDED from every "land" figure —
        // never dropped in silence, never pooled into "rural".
        m1_dryLand_tileUniform: { hits: landHits.length, n: land.length, pct: pct(landHits.length, land.length) },
        m1_dryLand_parcelUniform: { weightedHits: Wb, weightTotal: W, pct: pct(Wb, W) },
        m1_wholeFrameIncludingWater: { hits: hits.length, n: rows.length, pct: pct(hits.length, rows.length) },
        byStratum: byGroup(rows, (x) => x.s),
        byHoofdgroep: byGroup(rows, (x) => x.c.hoofdgroep || '(no substantive zone at the point)'),
        m3_status_wholeFrame: tally(rows.map((x) => x.c.status)),
        m3_status_dryLand: tally(land.map((x) => x.c.status)),
        m3_status_dryLand_byStratum: Object.fromEntries(['urban(>=240 parcels/km2)', 'rural(<240 parcels/km2)']
            .map((s) => [s, tally(land.filter((x) => x.s === s).map((x) => x.c.status))])),
        // The F1 gap, broken out by the zone that produced it — the decision-relevant cut.
        f1GapByHoofdgroep: tally(land.filter((x) => x.c.status === 'F1_GAP').map((x) => x.c.hoofdgroep || '(unstated)')),
        f1GapByBestemming: Object.fromEntries(Object.entries(
            tally(land.filter((x) => x.c.status === 'F1_GAP').map((x) => x.c.bestemming || '(unnamed)')),
        ).sort((a, b) => b[1] - a[1]).slice(0, 15)),
        rowsClassified: rows,
    };
}

const A = analyse(land, 'LAND (tile-uniform over all cadastred land)');
const B = analyse(urban, 'DENSE/URBAN oversample (tiles with >= 15 parcels)');

// ── M2 + M5a: maatvoering fill, over the GOVERNING plan, on parcels that have a plan ─────────
function maatFill(sample) {
    if (!sample) return null;
    const rawNaam = {};
    const bump = (o, k) => { o[k] = (o[k] ?? 0) + 1; };
    const perRowKinds = [];
    for (const r of sample.rows) {
        const dossier = governingDossier(r);
        // Raw SVBP typering histogram — every maatvoering naam served at the point, governing
        // dossier or not. This is the census that shows what the vocabulary MISSES.
        for (const f of (r.layers?.maatvoering ?? [])) {
            const mv = parseMaat(f);
            if (mv) bump(rawNaam, mv.naam);
        }
        const ks = dossier ? resolvedKinds(r, dossier).kinds : new Map();
        perRowKinds.push({
            hasPlan: dossier !== null,
            hasBvk: dossier !== null && (r.layers?.bouwvlak ?? []).some((f) => f.dossierid === dossier),
            ks: new Set(ks.keys()),
        });
    }
    const denomPlan = perRowKinds.filter((x) => x.hasPlan).length;
    const denomBvk = perRowKinds.filter((x) => x.hasBvk).length;
    const fill = {};
    for (const k of ['max-bouwhoogte', 'max-goothoogte', 'max-aantal-bouwlagen', 'max-bebouwingspercentage', 'fsi', 'max-inhoud', 'max-dakhelling', 'max-nokhoogte', 'max-oppervlakte', 'max-wooneenheden']) {
        const nAll = perRowKinds.filter((x) => x.ks.has(k)).length;
        const nBvk = perRowKinds.filter((x) => x.hasBvk && x.ks.has(k)).length;
        fill[k] = {
            ofParcelsWithAPlan: nAll + '/' + denomPlan + ' = ' + pct(nAll, denomPlan),
            ofParcelsInABouwvlak: nBvk + '/' + denomBvk + ' = ' + pct(nBvk, denomBvk),
        };
    }
    const goot = perRowKinds.filter((x) => x.ks.has('max-goothoogte')).length;
    const bouw = perRowKinds.filter((x) => x.ks.has('max-bouwhoogte')).length;
    const both = perRowKinds.filter((x) => x.ks.has('max-goothoogte') && x.ks.has('max-bouwhoogte')).length;
    const bothNoRoof = perRowKinds.filter((x) => x.ks.has('max-goothoogte') && x.ks.has('max-bouwhoogte') && !x.ks.has('max-dakhelling') && !x.ks.has('max-nokhoogte')).length;
    return {
        denominators: { parcelsWithAPlan: denomPlan, parcelsInABouwvlak: denomBvk, parcelsSampled: sample.rows.length },
        fill,
        m5a_roof: {
            goothoogtePresent: goot, bouwhoogtePresent: bouw, coOccurring: both,
            coOccurringWithNoRoofFormMaatvoering: bothNoRoof,
            pctOfCoOccurrencesUnderdeterminedByMaatvoeringAlone: pct(bothNoRoof, both),
        },
        rawNaamHistogram: Object.fromEntries(Object.entries(rawNaam).sort((a, b) => b[1] - a[1]).slice(0, 60)),
    };
}

// ── M6-partial: IMRO generation + Omgevingswet-boundary dating ────────────────────────────────
function m6(sample) {
    if (!sample) return null;
    const ver = {}, typ = {}, dates = [];
    for (const r of sample.rows) {
        const g = governing(r.layers?.bestemmingsplangebied);
        if (!g) continue;
        ver[g.versieimro ?? '(none)'] = (ver[g.versieimro ?? '(none)'] ?? 0) + 1;
        typ[g.typeplan ?? '(none)'] = (typ[g.typeplan ?? '(none)'] ?? 0) + 1;
        if (g.datum) dates.push(String(g.datum));
    }
    dates.sort();
    const post = dates.filter((d) => d >= '2024-01-01').length;
    return {
        versieimro: ver, typeplan: typ,
        governingPlanDate: {
            n: dates.length, min: dates[0] ?? null, median: dates[Math.floor(dates.length / 2)] ?? null, max: dates[dates.length - 1] ?? null,
            onOrAfterOmgevingswet_2024_01_01: post + '/' + dates.length + ' = ' + pct(post, dates.length),
        },
    };
}

// ── M4 + M5b from the plan-text harness ───────────────────────────────────────────────────────
function m4m5b(pt) {
    if (!pt) return null;
    const ok = pt.results.filter((r) => r.fetch === 'OK');
    const withPeil = ok.filter((r) => r.peilDefinition);
    const classFreq = {};
    for (const r of withPeil) for (const c of r.peilClasses ?? []) classFreq[c] = (classFreq[c] ?? 0) + 1;
    // Cluster VERBATIM definitions by a normalised key; keep one exemplar per cluster.
    const clusters = new Map();
    for (const r of withPeil) {
        const key = r.peilDefinition.toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);
        const c = clusters.get(key) ?? { n: 0, exemplar: r.peilDefinition, plans: [], classes: r.peilClasses };
        c.n++; c.plans.push(r.planId);
        clusters.set(key, c);
    }
    const termFreq = {};
    for (const r of ok) for (const [k, v] of Object.entries(r.terms ?? {})) if (v) termFreq[k] = (termFreq[k] ?? 0) + 1;
    return {
        plansFetched: ok.length, plansFailed: pt.results.length - ok.length,
        distinctGoverningPlansInSample: pt.distinctGoverningPlans,
        plansPublishingATextUrl: pt.plansWithTextUrl,
        m4: {
            withAResolvablePeilDefinition: withPeil.length + '/' + ok.length + ' = ' + pct(withPeil.length, ok.length),
            distinctDefinitions: clusters.size,
            physicalReferenceClassFrequency: classFreq,
            clusters: [...clusters.values()].sort((a, b) => b.n - a.n).slice(0, 15)
                .map((c) => ({ n: c.n, classes: c.classes, exemplar: c.exemplar.slice(0, 400), examplePlan: c.plans[0] })),
        },
        m5b_and_census: Object.fromEntries(Object.entries(termFreq).sort((a, b) => b[1] - a[1])
            .map(([k, v]) => [k, v + '/' + ok.length + ' = ' + pct(v, ok.length)])),
    };
}

const report = {
    generatedAt: new Date().toISOString(),
    lane: 'ENVELOPE-NLDK',
    M1_M3: { land: A && { ...A, rowsClassified: undefined }, urban: B && { ...B, rowsClassified: undefined } },
    M2_M5a: { land: maatFill(land), urban: maatFill(urban) },
    M6_partial: { land: m6(land), urban: m6(urban) },
    M4_M5b: m4m5b(ptext),
};
console.log(JSON.stringify(report, null, 1));
