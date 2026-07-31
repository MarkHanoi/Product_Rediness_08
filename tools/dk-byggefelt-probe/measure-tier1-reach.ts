// §MULTI-PART-EXPLICIT-AREA — MEASURE the tier-1 reach of the DK byggefelt path, before and after.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS MEASURES, AND AGAINST WHICH DENOMINATOR
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Denominator: the BINDING adopted byggefelter — `bygkunifelt=true AND bygvejledende=false` — whose
// live count is re-read at the top of every run and PRINTED WITH THE RUN DATE. It drifts: L-610 saw
// 13,627 on 2026-07-23, this session saw 13,629 on 2026-07-31. Any number this prints is meaningless
// without that pair.
//
// ⚠ THIS IS A FEATURE-SIDE MEASUREMENT. It says what share of BINDING BYGGEFELTER can place a
// footprint. It does NOT say what share of Danish PARCELS can — that is a different denominator
// (~2.5 M cadastral parcels), it is far lower, and it is still UNCOMPUTED (DK-BYGGEFELT-PRODUCER §5,
// item S1). Do not let one be quoted as the other.
//
// TWO REACHES ARE REPORTED, because they answer different questions and only one of them is
// like-for-like with the previously published 79–81 %:
//
//   A. ADAPTER REACH   — can the producer→classifier→resolver chain hand this feature to tier 1 at
//                        all? The OLD criterion was "single-part AND hole-free", which is exactly
//                        what the 79–81 % figure measured. This is the number that moves.
//   B. END-TO-END REACH— does a real user click actually get a placed footprint? Adds the geometric
//                        solve against a REAL cadastral parcel from DAWA. It is strictly lower than
//                        A, and its residual is dominated by a DIFFERENT, pre-existing limitation
//                        (the convex-clip contract), which is reported separately so the two are
//                        never conflated.
//
// DATA SOURCES (both free, keyless, no account):
//   • Plandata WFS   https://geoserver.plandata.dk/geoserver/wfs   (Erhvervsstyrelsen)
//   • DAWA jordstykker https://api.dataforsyningen.dk/jordstykker  (cadastral parcels, EPSG:25832)
//
// ⚠ DAWA TRAP, VERIFIED 2026-07-31: the GLOBAL bulk `jordstykker` endpoint returns HTTP 200 and
// curl exit 0 with a payload silently truncated mid-field at ~288 MB. THE STATUS CODE IS NOT THE
// ANSWER. This script only ever issues per-point lookups, and it PARSE-VALIDATES every body — a
// body that does not parse is discarded and counted, never treated as "no parcel here".
//
// SAMPLING: systematic over `startIndex` strata, exactly as the 79–81 % figure was taken, so the
// before/after comparison is on the same sampling design. ⚠ Systematic over WFS STORAGE ORDER is
// not a random permutation — treat every share as a good estimate, not an exact proportion.
//
// Run:  npx tsx tools/dk-byggefelt-probe/measure-tier1-reach.ts [--strata 40 --per 5]

import {
    byggefeltCollectionToEvidence,
    dkByggefeltFromFeatureEvidence,
    groupEvidenceByFeature,
    solveExplicitArea,
    validateRing,
    type DkByggefeltFeature,
    type ExplicitAreaPart,
} from '../../packages/site-parcel-data/src/index.js';
import type { Pt } from '@pryzm/schemas';

const WFS = 'https://geoserver.plandata.dk/geoserver/wfs';
const DAWA = 'https://api.dataforsyningen.dk/jordstykker';
const UA = 'PRYZM-BIM/1.0 (site-feasibility research; pryzmhello@gmail.com)';
const LAYER = 'theme_pdk_byggefelt_vedtaget';
const BINDING_CQL = 'bygkunifelt=true AND bygvejledende=false';

const args = process.argv.slice(2);
const argOf = (n: string, d: number): number => {
    const i = args.indexOf(`--${n}`);
    return i >= 0 && args[i + 1] ? Number(args[i + 1]) : d;
};
const STRATA = argOf('strata', 40);
const PER_STRATUM = argOf('per', 5);

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Polite GET with a parse guard. Returns null on ANY failure — the caller counts it as a DISCARD. */
async function getJson(url: string, label: string): Promise<unknown | null> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
            if (!res.ok) {
                await sleep(500 * (attempt + 1));
                continue;
            }
            const text = await res.text();
            // ⚠ PARSE-VALIDATE. A 200 with a truncated body is the DAWA trap; JSON.parse is what
            // actually catches it, not the status code.
            try {
                return JSON.parse(text) as unknown;
            } catch {
                console.warn(`[discard] ${label}: 200 with an UNPARSEABLE body (${text.length} bytes)`);
                return null;
            }
        } catch (e) {
            await sleep(500 * (attempt + 1));
            if (attempt === 2) console.warn(`[discard] ${label}: ${(e as Error).message}`);
        }
    }
    return null;
}

async function bindingCount(): Promise<number | null> {
    const url =
        `${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${LAYER}` +
        `&resultType=hits&CQL_FILTER=${encodeURIComponent(BINDING_CQL)}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    const xml = await res.text();
    const m = /numberMatched="(\d+)"/.exec(xml);
    return m ? Number(m[1]) : null;
}

async function fetchStratum(startIndex: number, count: number): Promise<DkByggefeltFeature[]> {
    const url =
        `${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${LAYER}` +
        `&outputFormat=application/json&srsName=EPSG:25832&count=${count}&startIndex=${startIndex}` +
        `&CQL_FILTER=${encodeURIComponent(BINDING_CQL)}`;
    const body = (await getJson(url, `wfs startIndex=${startIndex}`)) as { features?: unknown } | null;
    return Array.isArray(body?.features) ? (body!.features as DkByggefeltFeature[]) : [];
}

/** A representative interior-ish point of a ring: its vertex centroid (good enough to hit a parcel). */
function centroid(ring: readonly Pt[]): Pt {
    let x = 0;
    let z = 0;
    for (const p of ring) {
        x += p.x;
        z += p.z;
    }
    return { x: x / ring.length, z: z / ring.length };
}

function ringArea(ring: readonly Pt[]): number {
    let a = 0;
    for (let i = 0; i < ring.length; i += 1) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a / 2);
}

/** DAWA: the cadastral parcel containing an EPSG:25832 point. `null` = discard (never "no parcel"). */
async function parcelAt(pt: Pt): Promise<Pt[] | null> {
    const url = `${DAWA}?x=${pt.x.toFixed(2)}&y=${pt.z.toFixed(2)}&srid=25832&format=geojson`;
    const body = (await getJson(url, `dawa ${pt.x.toFixed(0)},${pt.z.toFixed(0)}`)) as
        | { features?: { geometry?: { type?: string; coordinates?: unknown } }[] }
        | null;
    if (body === null) return null;
    const f = body.features?.[0];
    if (!f?.geometry) return []; // a CLEAN answer: no parcel at this point. Distinct from a discard.
    const coords = f.geometry.coordinates;
    const rings = f.geometry.type === 'Polygon' ? (coords as number[][][]) : (coords as number[][][][])?.[0];
    const outer = rings?.[0];
    if (!Array.isArray(outer)) return [];
    return outer.map((c) => ({ x: Number(c[0]), z: Number(c[1]) }));
}

interface Row {
    id: string;
    parts: number;
    holes: number;
    /** OLD criterion: single-part AND hole-free — what the 79–81 % figure counted. */
    oldAdaptable: boolean;
    /** NEW criterion: the feature-level adapter accepts it. */
    newAdaptable: boolean;
    /** End-to-end against a real DAWA parcel. */
    solve: 'placed' | 'multi-region' | 'hole-bites' | 'non-convex' | 'no-overlap' | 'other' | 'no-parcel' | 'discard';
}

async function main(): Promise<void> {
    const runDate = new Date().toISOString().slice(0, 10);
    const total = await bindingCount();
    console.log(`\n=== DK byggefelt tier-1 reach — run ${runDate} ===`);
    console.log(`BINDING denominator (live, this run): ${total ?? 'UNREAD'}`);
    if (total === null) {
        console.error('Could not read the denominator. Refusing to print shares against an unknown base.');
        process.exit(1);
    }

    const step = Math.max(1, Math.floor(total / STRATA));
    const rows: Row[] = [];
    let wfsDiscards = 0;

    for (let s = 0; s < STRATA; s += 1) {
        const start = s * step;
        const features = await fetchStratum(start, PER_STRATUM);
        if (features.length === 0) {
            wfsDiscards += 1;
            continue;
        }
        for (const feature of features) {
            // The REAL pipeline: the same classifier + the same feature-level adapter production uses.
            // An identity projector stands in for the L5 scene-XZ transform: it is a rigid translation
            // in production too, so it changes no topology and therefore no answer measured here.
            const evidence = byggefeltCollectionToEvidence([feature], { project: (p) => p });
            const groups = groupEvidenceByFeature(evidence);
            if (groups.length === 0) continue;
            const group = groups[0]!;
            const id = String((feature.properties as { id?: unknown } | undefined)?.id ?? 'unknown');
            const partCount = group.length;
            const holeCount = group.reduce(
                (n, e) => n + (e.geometry.kind === 'polygon' ? e.geometry.holes.length : 0),
                0,
            );
            const oldAdaptable = partCount === 1 && holeCount === 0;

            const adapted = dkByggefeltFromFeatureEvidence(group);
            const newAdaptable = adapted.ok;

            let solve: Row['solve'] = 'other';
            if (!adapted.ok) {
                solve = 'other';
            } else {
                const parts: readonly ExplicitAreaPart[] = adapted.byggefelt.parts;
                const biggest = [...parts].sort((a, b) => ringArea(b.outer) - ringArea(a.outer))[0]!;
                const parcel = await parcelAt(centroid(biggest.outer));
                if (parcel === null) {
                    solve = 'discard';
                } else if (parcel.length < 3) {
                    solve = 'no-parcel';
                } else if (validateRing(parcel) !== null) {
                    // A malformed cadastral ring is a DAWA-side data problem, not a byggefelt one.
                    solve = 'discard';
                } else {
                    const out = solveExplicitArea({ parcelRing: parcel, footprintParts: parts });
                    solve = out.ok
                        ? 'placed'
                        : out.reason === 'multi-region-on-parcel'
                          ? 'multi-region'
                          : out.reason === 'hole-intersects-parcel'
                            ? 'hole-bites'
                            : out.reason === 'non-convex-both'
                              ? 'non-convex'
                              : out.reason === 'no-overlap'
                                ? 'no-overlap'
                                : 'other';
                }
                await sleep(120); // polite to DAWA
            }
            rows.push({ id, parts: partCount, holes: holeCount, oldAdaptable, newAdaptable, solve });
        }
        await sleep(200); // polite to Plandata
    }

    const n = rows.length;
    const pct = (k: number): string => `${((100 * k) / n).toFixed(1)}%`;
    const count = (f: (r: Row) => boolean): number => rows.filter(f).length;

    const multi = count((r) => r.parts > 1);
    const holed = count((r) => r.holes > 0);
    const oldOk = count((r) => r.oldAdaptable);
    const newOk = count((r) => r.newAdaptable);

    console.log(`\nsample n = ${n} (systematic, ${STRATA} strata × ${PER_STRATUM}); wfs stratum discards = ${wfsDiscards}`);
    console.log(`\n-- geometry shape (reproduces the previously published split) --`);
    console.log(`  multi-part                : ${multi} (${pct(multi)})   max parts = ${Math.max(...rows.map((r) => r.parts))}`);
    console.log(`  has ≥1 hole               : ${holed} (${pct(holed)})`);

    console.log(`\n-- A. ADAPTER REACH (like-for-like with the old 79–81%) --`);
    console.log(`  BEFORE (single-part & hole-free): ${oldOk} (${pct(oldOk)})  ⇒ ≈ ${Math.round((oldOk / n) * total).toLocaleString()} of ${total.toLocaleString()}`);
    console.log(`  AFTER  (feature-level adapter)  : ${newOk} (${pct(newOk)})  ⇒ ≈ ${Math.round((newOk / n) * total).toLocaleString()} of ${total.toLocaleString()}`);

    const solved = count((r) => r.solve === 'placed');
    const discards = count((r) => r.solve === 'discard');
    const evaluable = n - discards;
    const pctE = (k: number): string => (evaluable > 0 ? `${((100 * k) / evaluable).toFixed(1)}%` : 'n/a');
    console.log(`\n-- B. END-TO-END on a real DAWA parcel (denominator excludes ${discards} discards) --`);
    console.log(`  evaluable                 : ${evaluable}`);
    console.log(`  PLACED                    : ${solved} (${pctE(solved)})`);
    for (const k of ['non-convex', 'no-overlap', 'multi-region', 'hole-bites', 'no-parcel', 'other'] as const) {
        const c = count((r) => r.solve === k);
        if (c > 0) console.log(`  refused ${k.padEnd(18)}: ${c} (${pctE(c)})`);
    }
    // What the SAME sample would have produced under the old adapter: a multi-part or holed feature
    // never reached the solve at all, so it could not place.
    const solvedOld = count((r) => r.solve === 'placed' && r.oldAdaptable);
    console.log(`  PLACED under the OLD adapter: ${solvedOld} (${pctE(solvedOld)})`);

    console.log(`\n⚠ Denominator = BINDING BYGGEFELTER (${total.toLocaleString()}, ${runDate}), NOT Danish parcels.`);
    console.log(`⚠ Parcel-side coverage remains UNCOMPUTED (DK-BYGGEFELT-PRODUCER §5 / S1).\n`);
}

void main();
