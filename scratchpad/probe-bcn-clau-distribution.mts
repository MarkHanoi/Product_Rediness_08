// L-538 PROBE — the Barcelona *clau* frequency distribution.
//
// WHY: our buildable-envelope engine answers for exactly two zone codes (13a / 13E). To plan
// "complete Barcelona" we need to know which PGM claus actually cover the city's land, measured,
// not guessed. This samples a regular grid across the Barcelona municipal bbox and asks the LIVE
// MUC WMS which qualification polygon contains each point.
//
// ⚠ IT REUSES THE PRODUCTION PARSER. `fetchQualificationAtPoint` is imported from
// `server/mucZoningProxy.js` — the same function `/api/muc/zoning` serves and therefore the same
// one `applyBcnZoningThenFallback` consumes. So the probe CANNOT disagree with the code path it is
// characterising: same GetFeatureInfo URL, same §MUC-ONE-CONTAINER-OR-REFUSE selection, same
// refusal semantics. (SPAIN-CADASTRAL-DISSOLVE-PROBE.md set this precedent.)
//
// ⚠ WHAT IT MEASURES: AREA share, not parcel count. A regular grid is an unbiased estimator of
// LAND AREA per clau. It is NOT an estimator of parcel count (dense small-parcel fabric is
// under-counted relative to large-parcel fabric) and NOT of floor area. Read the output as
// "share of Barcelona's ground", and read the buildable-only column as "share of the private
// buildable ground". Stated here so the plan cannot quietly upgrade it to something it is not
// (C58 §1.11 — a real number answering a different question).
//
// Run:  npx tsx scratchpad/probe-bcn-clau-distribution.mts

import { fetchQualificationAtPoint } from '../server/mucZoningProxy.js';

/** Barcelona municipal bounding box (WGS84), generous — off-municipality hits are filtered by INE. */
const BBOX = { south: 41.317, north: 41.470, west: 2.052, east: 2.234 };

/** ~300 m grid. Fine enough to resolve block-scale fabric, coarse enough to stay polite. */
const LAT_STEP = 0.0027;
const LON_STEP = 0.0036;

const INE_BARCELONA = '08019';
const CONCURRENCY = 5;

type Hit = {
    lat: number;
    lon: number;
    clau: string | null;
    label: string | null;
    mucCode: string | null;
    ine: string | null;
};

function grid(): Array<{ lat: number; lon: number }> {
    const pts: Array<{ lat: number; lon: number }> = [];
    for (let lat = BBOX.south; lat <= BBOX.north; lat += LAT_STEP) {
        for (let lon = BBOX.west; lon <= BBOX.east; lon += LON_STEP) {
            pts.push({ lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) });
        }
    }
    return pts;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    await Promise.all(
        Array.from({ length: n }, async () => {
            for (;;) {
                const i = next++;
                if (i >= items.length) return;
                out[i] = await fn(items[i]!, i);
            }
        }),
    );
    return out;
}

/**
 * PGM *systems* + protected soil (no buildable envelope) vs private buildable land.
 *
 * ⚠ THE CLASSIFIER IS THE PROVIDER'S OWN HARMONISED CODE, NOT OUR GUESS. `CODI_QUAL_MUC`
 * (`mucCode`) is the Generalitat's cross-Catalonia harmonisation of the municipal clau, and its
 * FIRST LETTER already carries exactly the distinction we need:
 *   `S…` = sistema / sòl protegit — SX viari, SV espais lliures + parc forestal, SE equipaments,
 *          SF ferroviari, SP portuari, ST serveis tècnics, SS protecció de sistemes.
 *   `R…` = residential zone (R1 nucli antic, R2 densificació, R4 volumetria/aïllada plurifam,
 *          R6 aïllada unifamiliar).
 *   `A…` = activitat econòmica (A1 industrial).
 * An EARLIER VERSION of this probe classified on the clau's leading digit and got `13a` wrong
 * (leading `1` ⇒ "system"), which is the whole reason this note exists: the taxonomy is not
 * positional, so do not infer it positionally. `mucCode` is coarser than `clau` and MUST NOT pick
 * a rule pack (mucZoningProxy.js says so explicitly) — but system-vs-private is precisely the
 * coarse question it is fit to answer.
 *
 * Falls back to the clau prefix only when the provider returned no harmonised code.
 */
function isSystem(clau: string, mucCode: string | null): boolean {
    const m = (mucCode ?? '').trim().toUpperCase();
    if (m) return m.startsWith('S');
    const c = clau.trim().toUpperCase();
    return c.startsWith('SX') || c.startsWith('SG') || c.startsWith('SL');
}

async function main() {
    const pts = grid();
    console.log(`[probe] ${pts.length} grid points over Barcelona bbox (~300 m spacing).`);
    const t0 = Date.now();

    let done = 0;
    const hits = await pool<{ lat: number; lon: number }, Hit>(pts, CONCURRENCY, async (p) => {
        let q: any = null;
        try {
            q = await fetchQualificationAtPoint(p.lat, p.lon);
        } catch {
            q = null;
        }
        done++;
        if (done % 50 === 0) {
            console.log(`[probe] ${done}/${pts.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
        }
        return {
            lat: p.lat,
            lon: p.lon,
            clau: q?.clau ?? null,
            label: q?.clauLabel ?? null,
            mucCode: q?.mucCode ?? null,
            ine: q?.ineCode ?? null,
        };
    });

    const inBcn = hits.filter((h) => h.clau && h.ine === INE_BARCELONA);
    const resolvedElsewhere = hits.filter((h) => h.clau && h.ine !== INE_BARCELONA).length;
    const unresolved = hits.filter((h) => !h.clau).length;

    console.log(
        `\n[probe] resolved-in-Barcelona=${inBcn.length}  resolved-other-municipality=${resolvedElsewhere}  ` +
            `unresolved(sea/refused/upstream)=${unresolved}  elapsed=${((Date.now() - t0) / 1000).toFixed(0)}s`,
    );

    const counts = new Map<string, { n: number; label: string | null; muc: string | null }>();
    for (const h of inBcn) {
        const k = h.clau!;
        const e = counts.get(k) ?? { n: 0, label: h.label, muc: h.mucCode };
        e.n++;
        if (!e.label && h.label) e.label = h.label;
        counts.set(k, e);
    }

    const rows = [...counts.entries()].sort((a, b) => b[1].n - a[1].n);
    const total = inBcn.length;
    const buildableTotal = inBcn.filter((h) => !isSystem(h.clau!, h.mucCode)).length;

    console.log(`\n| clau | n | % of all BCN land | % of BUILDABLE land | system? | MUC | label |`);
    console.log(`|---|---|---|---|---|---|---|`);
    for (const [clau, e] of rows) {
        const sys = isSystem(clau, e.muc);
        const pctAll = ((e.n / total) * 100).toFixed(1);
        const pctB = sys ? '—' : ((e.n / buildableTotal) * 100).toFixed(1);
        console.log(`| \`${clau}\` | ${e.n} | ${pctAll}% | ${pctB}% | ${sys ? 'SYSTEM' : 'private'} | ${e.muc ?? ''} | ${e.label ?? ''} |`);
    }

    console.log(
        `\n[probe] TOTALS  points-in-BCN=${total}  buildable=${buildableTotal} (${((buildableTotal / total) * 100).toFixed(1)}%)  ` +
            `systems=${total - buildableTotal}  distinct-claus=${rows.length}`,
    );

    // Cumulative coverage of the buildable land, so the phasing can be cut at a real threshold.
    const bRows = rows.filter(([c, e]) => !isSystem(c, e.muc));
    let cum = 0;
    console.log(`\n[probe] CUMULATIVE buildable coverage:`);
    for (const [clau, e] of bRows) {
        cum += e.n;
        console.log(
            `  ${clau.padEnd(8)} +${((e.n / buildableTotal) * 100).toFixed(1).padStart(5)}%  → cumulative ${((cum / buildableTotal) * 100).toFixed(1)}%`,
        );
    }

    // What today's engine covers.
    const covered = inBcn.filter((h) => h.clau === '13a' || h.clau === '13E').length;
    console.log(
        `\n[probe] TODAY'S ENGINE (13a/13E only) covers ${covered}/${buildableTotal} buildable points = ` +
            `${((covered / buildableTotal) * 100).toFixed(1)}% of Barcelona's buildable land.`,
    );

    // Raw dump for the plan doc.
    const fs = await import('node:fs');
    fs.writeFileSync(
        new URL('./bcn-clau-distribution.json', import.meta.url),
        JSON.stringify({ bbox: BBOX, latStep: LAT_STEP, lonStep: LON_STEP, total, buildableTotal, rows, hits }, null, 2),
    );
    console.log(`\n[probe] raw → scratchpad/bcn-clau-distribution.json`);
}

main().catch((e) => {
    console.error('[probe] FAILED', e);
    process.exit(1);
});
