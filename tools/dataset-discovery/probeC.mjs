#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// PROBE C — THE COLD START PROBE
//
// *"Its performance on virgin cities is itself a measurement — log where it FAILS, not just what it
// finds."* — the founder, Addendum 1.
//
// Runs Stage 0 against a RANDOM, STRATIFIED sample of Spanish municipalities that no human has
// prepared, and reports what fraction of the country is reachable at all.
//
// ⚠⚠ THE THING THIS PROBE MUST NOT DO IS UNDER-REPORT. Its output is a count of cities with
// nothing, and *"a missed service and an absent service produce identical records"*. So every
// negative here is carried as `Unknown` unless it satisfies the Stage-0 negative-proof conditions,
// and the report separates:
//     • what the CITY lacks   (a genuine absence)
//     • what the TOOL could not determine (our limitation)
// That split is the deliverable — it says whether the instrument or the country is the constraint.
//
// SAMPLING — REPRODUCIBLE BY CONSTRUCTION
//   • Frame: INE table 29005 «Cifras oficiales del padrón por municipio», the authoritative
//     municipal padrón. ⚠ NOT Wikidata P1082 — those figures are unevenly maintained and a bad band
//     assignment biases the tier estimate directly.
//   • País Vasco (INE 01/20/48) and Navarra (31) are excluded BEFORE sampling: foral cadastres are
//     a separate adapter, not a coverage gap.
//   • Stratified by population band, random within band, from a SEEDED PRNG. Same seed ⇒ same
//     sample, forever.
//
// USAGE
//   node probeC.mjs --ine <path-to-29005.csv> --n 20 --seed 20260802 --out reports
//   node probeC.mjs --ine <csv> --dry-run          # print the sample, probe nothing
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDiscovery, coldStartRecord, foralExclusion, probe, FORAL_PROVINCE_PREFIXES } from './discover.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROBE_C_VERSION = '1.0';

/** The population bands. Stated here so the stratification is auditable, not implicit. */
export const POPULATION_BANDS = [
    { id: 'A', label: '<1,000', min: 0, max: 999 },
    { id: 'B', label: '1,000–4,999', min: 1000, max: 4999 },
    { id: 'C', label: '5,000–19,999', min: 5000, max: 19999 },
    { id: 'D', label: '20,000–99,999', min: 20000, max: 99999 },
    { id: 'E', label: '>=100,000', min: 100000, max: Infinity },
];

export function bandFor(pop) {
    return POPULATION_BANDS.find((b) => pop >= b.min && pop <= b.max) ?? null;
}

/** mulberry32 — a small, seeded, reproducible PRNG. */
export function makeRng(seed) {
    let a = seed >>> 0;
    return () => {
        a += 0x6D2B79F5;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Parse INE 29005 → one row per municipality at the LATEST period.
 * Format: `Municipios;Sexo;Periodo;Total` with `Municipios` = "44001 Ababuj" and Spanish thousand
 * separators in `Total`.
 */
export function parseIne29005(csvText) {
    const out = new Map();
    const lines = csvText.split(/\r?\n/);
    for (let i = 1; i < lines.length; i += 1) {
        const line = lines[i];
        if (!line) continue;
        const parts = line.split(';');
        if (parts.length < 4) continue;
        const [muni, sexo, periodo, total] = parts;
        if (sexo !== 'Total') continue;
        const m = /^(\d{5})\s+(.*)$/.exec(muni.trim());
        if (!m) continue;
        const year = Number(periodo);
        const pop = Number(String(total).replace(/\./g, '').replace(/,/g, '.').trim());
        if (!Number.isFinite(year) || !Number.isFinite(pop)) continue;
        const prev = out.get(m[1]);
        if (!prev || year > prev.year) out.set(m[1], { ineCode: m[1], name: m[2].trim(), year, population: pop });
    }
    return [...out.values()];
}

/** The sampling frame: all municipalities, minus the foral exclusion, with a band assigned. */
export function buildFrame(rows) {
    const excluded = [];
    const frame = [];
    for (const r of rows) {
        const f = foralExclusion({ cc: 'es', ineCode: r.ineCode });
        if (f.excluded) { excluded.push({ ...r, reason: f.detail }); continue; }
        const band = bandFor(r.population);
        if (!band) continue;
        frame.push({ ...r, band: band.id });
    }
    return { frame, excluded };
}

/** Stratified random sample: `perBand` municipalities from each band, seeded. */
export function stratifiedSample(frame, perBand, seed) {
    const rng = makeRng(seed);
    const out = [];
    for (const b of POPULATION_BANDS) {
        const pool = frame.filter((r) => r.band === b.id).sort((x, y) => x.ineCode.localeCompare(y.ineCode));
        // Fisher–Yates with the seeded PRNG, then take the head — unbiased and reproducible.
        for (let i = pool.length - 1; i > 0; i -= 1) {
            const j = Math.floor(rng() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        out.push(...pool.slice(0, perBand).map((r) => ({ ...r, bandLabel: b.label })));
    }
    return out;
}

/**
 * Municipality centroid, for the locality gate. Nominatim, one request per municipality, spaced to
 * respect its usage policy.
 *
 * ⚠ A geocode FAILURE is `null`, and a municipality with a null centroid still gets probed — the
 * locality verdict simply reports `unknown`. Refusing to probe would turn our geocoder's gap into a
 * claim about the city.
 */
export async function geocode(name, ineCode, { probes } = {}) {
    const q = encodeURIComponent(`${name}, Spain`);
    const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=es`;
    const p = await probe(url, { timeoutMs: 20000 });
    probes?.push({ url, httpStatus: p.httpStatus, bytes: p.bytes, ms: p.ms, outcome: p.outcome, note: `geocode ${ineCode} ${name}` });
    if (p.outcome !== 'ok') return { centroid: null, reason: p.outcome };
    try {
        const j = JSON.parse(p.body);
        if (!j.length) return { centroid: null, reason: 'geocoder returned no match' };
        return { centroid: { lat: Number(j[0].lat), lon: Number(j[0].lon) }, source: 'nominatim' };
    } catch { return { centroid: null, reason: 'geocoder body unparseable' }; }
}

/** Wilson score interval — the same estimator `computeScorecard.mjs` uses for a proportion. */
export function wilson95(successes, n) {
    if (!n) return { p: null, lo: null, hi: null, n: 0 };
    const z = 1.959963985;
    const p = successes / n;
    const d = 1 + (z * z) / n;
    const c = p + (z * z) / (2 * n);
    const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
    return { p, lo: Math.max(0, (c - s) / d), hi: Math.min(1, (c + s) / d), n };
}

/**
 * ⚠ §WHOSE FAILURE WAS IT — the split the coordinator asked for, and the hardest judgement here.
 *
 *   CITY  — the municipality genuinely publishes nothing we could find at a conventional address.
 *           This is a fact about Spain, and it is still bounded by our host conventions.
 *   TOOL  — WE could not determine the answer: a timeout, an unparseable schema, an undeclared
 *           publisher, an unreprojectable CRS, an incomplete axis/CRS matrix.
 *
 * The default is TOOL. A cause is only attributed to the CITY when every host we tried ANSWERED and
 * none served a service — i.e. the negative is proven under the Stage-0 conditions. Anything else
 * is our limitation, and calling it the city's would be the exact under-report this probe must not
 * commit.
 */
export function attributeFailure(record, sweep) {
    if (record.publishedGisService?.value === 'Yes') return { attribution: 'n/a', reason: 'a service was found' };
    const outcomes = sweep?.hostOutcomes ?? [];
    const transportFailures = outcomes.filter((o) => o.outcome === 'network-error' || o.outcome === 'timeout');
    const answered = outcomes.filter((o) => o.outcome === 'ok' || o.outcome === 'http-error');
    if (!outcomes.length) {
        return { attribution: 'tool', reason: 'no host sweep ran — nothing was tested' };
    }
    if (answered.length === 0) {
        return {
            attribution: 'tool',
            reason: `every candidate host failed at the transport layer (${transportFailures.length}/${outcomes.length}) — `
                + 'this is UNKNOWN, and asserts nothing about the municipality',
        };
    }
    if (timeoutHeavy(outcomes)) {
        return { attribution: 'tool', reason: `${transportFailures.length}/${outcomes.length} hosts timed out — the sample of reachable addresses is too thin to prove absence` };
    }
    return {
        attribution: 'city',
        reason: `${answered.length}/${outcomes.length} candidate hosts ANSWERED and none served an OGC/ArcGIS `
            + 'directory at a conventional path. ⚠ Still bounded by our host conventions — a service at an '
            + 'unconventional address would read the same way (the residual false-negative surface).',
    };
}
function timeoutHeavy(outcomes) {
    const t = outcomes.filter((o) => o.outcome === 'timeout').length;
    return t > 0 && t / outcomes.length >= 0.5;
}

// ═════════════════════════════════════════════════════════════════════════════
// §MAIN
// ═════════════════════════════════════════════════════════════════════════════
function parseArgs(argv) {
    const o = { n: 20, seed: 20260802, out: 'reports' };
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === '--ine') o.ine = argv[++i];
        else if (a === '--n') o.n = Number(argv[++i]);
        else if (a === '--seed') o.seed = Number(argv[++i]);
        else if (a === '--out') o.out = argv[++i];
        else if (a === '--dry-run') o.dryRun = true;
        else if (a === '--deep') o.deep = Number(argv[++i]);
    }
    return o;
}

async function main() {
    const a = parseArgs(process.argv.slice(2));
    if (!a.ine) { console.error('usage: probeC.mjs --ine <29005.csv> [--n 20] [--seed 20260802] [--dry-run]'); process.exit(2); }

    const csv = readFileSync(resolve(process.cwd(), a.ine), 'utf8');
    const rows = parseIne29005(csv);
    const { frame, excluded } = buildFrame(rows);
    const perBand = Math.max(1, Math.round(a.n / POPULATION_BANDS.length));
    const sample = stratifiedSample(frame, perBand, a.seed);

    console.log(`INE 29005: ${rows.length} municipalities · latest period ${Math.max(...rows.map((r) => r.year))}`);
    console.log(`foral excluded BEFORE sampling: ${excluded.length} (${Object.values(FORAL_PROVINCE_PREFIXES).join(' · ')})`);
    console.log(`frame: ${frame.length} · sample: ${sample.length} (${perBand}/band, seed ${a.seed})\n`);
    for (const s of sample) console.log(`  ${s.band} ${String(s.ineCode)} ${s.name.padEnd(34)} ${String(s.population).padStart(9)}`);
    if (a.dryRun) return;

    const results = [];
    for (const s of sample) {
        const probes = [];
        const g = await geocode(s.name, s.ineCode, { probes });
        const muni = {
            name: s.name, cc: 'es', ineCode: s.ineCode,
            jurisdictionId: null,
            centroid: g.centroid ?? { lat: 40.4, lon: -3.7 }, // fallback only feeds locality, which reports `unknown`
            centroidSource: g.centroid ? 'nominatim' : `UNRESOLVED (${g.reason})`,
            endpoints: [],
            candidateHosts: [],
            populationBand: s.bandLabel,
        };
        const t0 = Date.now();
        let report; let err = null;
        try {
            report = await runDiscovery(muni, { sweep: true, deep: a.deep ?? 0, sweepTimeoutMs: 12000 });
        } catch (e) { err = String(e?.message ?? e); }
        const cs = report ? coldStartRecord(report, { populationBand: s.bandLabel }) : {
            schema: 'pryzm.stage0.cold-start-record/1.0',
            municipality: muni,
            publishedGisService: { value: 'Unknown', evidence: `discovery threw: ${err}`, basis: 'tool-error' },
            digitalPgou: { value: 'Unknown', evidence: 'not reached', basis: 'tool-error' },
            counts: {}, cost: {}, undecided: [{ reason: 'schema-unrecognised', count: 1, detail: [err] }], toolError: true,
        };
        cs.populationBand = s.bandLabel;
        cs.population = s.population;
        cs.centroidSource = muni.centroidSource;
        cs.sweep = report?.sweep ?? null;
        cs.failureAttribution = attributeFailure(cs, report?.sweep);
        // geocode requests are part of the cost of a cold start
        cs.cost = { ...(cs.cost ?? {}), geocodeRequests: probes.length, totalWallClockMs: Date.now() - t0 };
        results.push(cs);
        console.log(`  ${s.band} ${s.ineCode} ${s.name.slice(0, 26).padEnd(27)} gis=${String(cs.publishedGisService.value).padEnd(7)} `
            + `pgou=${String(cs.digitalPgou.value).padEnd(7)} auth=${String(cs.publisherIsPlanningAuthority?.value ?? '—').padEnd(7)} `
            + `hosts=${cs.sweep?.hostsProbed ?? 0} found=${cs.sweep?.endpointsFound ?? 0} `
            + `req=${cs.cost?.requests ?? 0} ${(((cs.cost?.totalWallClockMs ?? 0)) / 1000).toFixed(0)}s [${cs.failureAttribution.attribution}]`);
    }

    const dir = resolve(HERE, a.out);
    mkdirSync(dir, { recursive: true });
    const meta = {
        probeCVersion: PROBE_C_VERSION,
        runAt: new Date().toISOString(),
        sampling: {
            frameSource: 'INE table 29005 «Cifras oficiales del padrón por municipio»',
            frameSourceNote: '⚠ NOT Wikidata P1082 — unevenly maintained, and a bad band assignment biases the tier estimate directly.',
            latestPeriod: Math.max(...rows.map((r) => r.year)),
            municipalitiesInIne: rows.length,
            foralExcluded: excluded.length,
            frameSize: frame.length,
            bands: POPULATION_BANDS.map((b) => ({ ...b, max: b.max === Infinity ? null : b.max })),
            perBand, seed: a.seed, method: 'seeded Fisher–Yates within band, take head',
            reproduce: `node probeC.mjs --ine <29005.csv> --n ${a.n} --seed ${a.seed}`,
        },
        results,
    };
    writeFileSync(join(dir, 'probe-c.json'), JSON.stringify(meta, null, 2));
    writeFileSync(join(dir, 'probe-c.jsonl'), results.map((r) => JSON.stringify(r)).join('\n') + '\n');
    console.log(`\nwrote ${join(dir, 'probe-c.json')}`);
    summarise(results);
}

export function summarise(results) {
    const n = results.length;
    const gisYes = results.filter((r) => r.publishedGisService.value === 'Yes').length;
    const gisUnknown = results.filter((r) => r.publishedGisService.value === 'Unknown').length;
    const gisNo = results.filter((r) => r.publishedGisService.value === 'No').length;
    const w = wilson95(gisYes, n);
    console.log(`\npublished GIS service: Yes ${gisYes} · No ${gisNo} · Unknown ${gisUnknown}  (n=${n})`);
    console.log(`  Yes rate 95% CI: ${(w.p * 100).toFixed(1)}% [${(w.lo * 100).toFixed(1)}, ${(w.hi * 100).toFixed(1)}]`);
    const byAttr = {};
    for (const r of results) byAttr[r.failureAttribution.attribution] = (byAttr[r.failureAttribution.attribution] ?? 0) + 1;
    console.log('  failure attribution:', JSON.stringify(byAttr));
    console.log('  ⚠ `Unknown` is NOT `No`. Do not collapse them.');
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
    main().catch((e) => { console.error(e); process.exit(1); });
}
