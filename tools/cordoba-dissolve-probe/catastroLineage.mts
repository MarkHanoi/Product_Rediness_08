// §CORDOBA-DISSOLVE-RATE, LINEAGE 2 — the SAME question against CATASTRO INSPIRE, which is the
// lineage the PRODUCTION parcel path actually fetches (`parcelProviders/registry.ts` → catastro).
//
// The sibling probe measured 88.5 % on COACo's `vcatastro_urbanismo` copy. If Catastro agrees, the
// inherited "Córdoba 0/3" was a three-sample accident and CLOSURE-REGISTER blocker 20's ceiling
// dissolves with it. If Catastro disagrees, the two lineages differ and blocker 20 stands — but for
// a reason nobody had stated.
//
// POLITENESS: Catastro publishes a "no massive download" clause. One in-flight request, a real
// User-Agent, a 400 ms floor between calls, and a deliberately SMALL sample.
import { dissolveParcelsToBlockRing } from '../../packages/site-parcel-data/src/geometry/blockRing.js';

type Pt = { x: number; z: number };
const UA = { 'User-Agent': 'PRYZM-city-completion-dissolve-probe/1.0 (+pryzmhello@gmail.com)' };
const GAP_MS = 400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Sample points spread across the Sur + Noroeste pilot (the fabric the alignment zones govern).
// Drawn from the committed parcel sample so they are known to be on real Córdoba parcels.
const sample = JSON.parse(
    await (await import('node:fs/promises')).readFile(
        new URL('../../tools/city-completion/samples/cordoba.parcel-sample.json', import.meta.url), 'utf8'),
);
const pts: Array<{ lat: number; lon: number }> = sample.buildable.points
    .filter((p: any) => p.outcome === 'ok')
    .slice(0, 30)
    .map((p: any) => ({ lat: p.lat, lon: p.lon }));

// A bbox wide enough to capture a whole manzana around the point (~140 m).
const D = 0.0009;

/** WGS84 → local metric XZ about an origin (equirectangular; exact enough at block scale). */
const toXZ = (lat: number, lon: number, lat0: number, lon0: number): Pt => ({
    x: (lon - lon0) * 111320 * Math.cos((lat0 * Math.PI) / 180),
    z: (lat - lat0) * 110540,
});

const byReason = new Map<string, number>();
let ok = 0, attempted = 0, transportFail = 0, tooFew = 0;

for (const p of pts) {
    await sleep(GAP_MS);
    const url = 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=WFS&version=2.0.0'
        + '&request=GetFeature&typeNames=cp:CadastralParcel&srsName=EPSG:4326'
        + `&bbox=${(p.lat - D).toFixed(7)},${(p.lon - D).toFixed(7)},${(p.lat + D).toFixed(7)},${(p.lon + D).toFixed(7)}`;
    let body: string;
    try {
        const r = await fetch(url, { headers: UA });
        body = await r.text();
        if (!r.ok) { transportFail++; continue; }
    } catch { transportFail++; continue; }
    if (/ExceptionReport/i.test(body)) {
        // A MEASURED ABSENCE is not a transport failure (the probe's own honesty rule) — but for a
        // DISSOLVE question it is simply "no block here", so it leaves the denominator.
        if (/No records founded for BBOX/i.test(body)) { tooFew++; continue; }
        transportFail++; continue;
    }

    // Group the returned parcels by MANZANA (refcat 5-char prefix inside the gml:id) and dissolve
    // the group the query point's own manzana belongs to — the production question exactly.
    const members = body.split(/<cp:CadastralParcel\b/).slice(1);
    const parcels: Array<{ ref: string; ring: Array<{ lat: number; lon: number }> }> = [];
    for (const m of members) {
        const idm = m.match(/gml:id="([^"]+)"/);
        const posM = m.match(/<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/);
        if (!posM || !idm) continue;
        const nums = posM[1].trim().split(/\s+/).map(Number);
        const ring: Array<{ lat: number; lon: number }> = [];
        for (let i = 0; i + 1 < nums.length; i += 2) ring.push({ lat: nums[i], lon: nums[i + 1] });
        // gml:id looks like `ES.SDGC.CP.3863715UG4936S`; the manzana is the first 5 of the refcat.
        const ref = (idm[1].split('.').pop() ?? '').slice(0, 5);
        if (ref && ring.length >= 4) parcels.push({ ref, ring });
    }
    const groups = new Map<string, typeof parcels>();
    for (const q of parcels) groups.set(q.ref, [...(groups.get(q.ref) ?? []), q]);
    // the largest group in the window = the manzana the point sits in
    const biggest = [...groups.values()].sort((a, b) => b.length - a.length)[0];
    if (!biggest || biggest.length < 2) { tooFew++; continue; }

    attempted++;
    const rings: Pt[][] = biggest.map((q) => q.ring.map((c) => toXZ(c.lat, c.lon, p.lat, p.lon)));
    const r = dissolveParcelsToBlockRing(rings);
    const reason = r.degenerate ? (r.reason ?? 'unknown') : 'OK';
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
    if (!r.degenerate) ok++;
}

console.log('\n=== DISSOLVE RATE (CATASTRO INSPIRE lineage — the production path) ===');
console.log(`manzanas attempted: ${attempted}  |  OK ${ok} = ${attempted ? (100 * ok / attempted).toFixed(1) : 'n/a'}%`);
console.log('by reason:', JSON.stringify([...byReason.entries()].sort((a, b) => b[1] - a[1])));
console.log(`excluded — <2 parcels in window / no records: ${tooFew}  |  TRANSPORT FAILURES (never scored): ${transportFail}`);
