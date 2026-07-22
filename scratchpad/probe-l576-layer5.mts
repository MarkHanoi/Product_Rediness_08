// TASK 4 / LAYER 5 — of the parcels that GET a depth, how many get a constructed HEIGHT, and via
// which provenance? A real depth with a null height is NOT sound end-to-end.
//
// Reuses the L-576 live path exactly (GetParcel centroid → one bbox → manzana filter → dissolve),
// then continues into the Art. 327.2 chain the product uses: measure the *amplada de vial* by
// casting rays from the dissolved block ring to the OPPOSING frontages, take the governing
// (narrowest) width, and resolve the storey band.
//
// ⚠ `BAND_EDGE_GUARD_M` REFUSALS ARE COUNTED SEPARATELY AND ARE NOT FAILURES. When a measured
// width sits within 0.5 m of a band boundary, the noise — not the measurement — would decide the
// storey band, so the resolver refuses. That is the design working, and lumping it in with "no
// height" would understate the engine and misdirect the fix.
//
// Run:  npx tsx scratchpad/probe-l576-layer5.mts

import {
    buildParcelBboxUrl, parseParcelCollectionGml, manzanaPrefix,
} from '../server/parcelZoningProxy.js';
import { dissolveParcelsToBlockRing } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import { measureStreetWidths, governingStreetWidth } from '../packages/site-parcel-data/src/geometry/streetWidth.js';
import { resolveAlcadaReguladora, BAND_EDGE_GUARD_M } from '../packages/site-parcel-data/src/rulepacks/bcnAlcadaReguladora.js';
// ⚠ THE FIRST RUN OF THIS PROBE MEASURED THE WRONG CHAIN. It called `resolveAlcadaReguladora`
// on the RAW measured width, bypassing the tier resolution production actually applies — and the
// early output showed exactly what that costs: Eixample streets measuring 19.5–19.9 m all
// straddling the 20 m band edge and refusing. Production snaps those to the 20 m declared quantum
// (`tier=snapped-to-declared-quantum`, visible in the founder's own console) and that snap sets
// `trustedOfficialWidth`, which legitimately DISARMS the band-edge guard. A probe that skips it
// does not understate the number slightly — it measures a different system.
import { resolveAmpladaDeVial, BCN_STREET_WIDTH_QUANTISATION } from '../packages/site-parcel-data/src/rulepacks/ampladaDeVial.js';
import type { Pt } from '@pryzm/schemas';
import { readFileSync, writeFileSync } from 'node:fs';

const EARTH_RADIUS_M = 6_378_137;
const DEG2RAD = Math.PI / 180;

function project(ring: Array<{ lat: number; lon: number }>, lat0: number, lon0: number): Pt[] {
    const cos0 = Math.cos(lat0 * DEG2RAD);
    return ring.map((p) => ({
        x: (p.lon - lon0) * DEG2RAD * EARTH_RADIUS_M * cos0,
        z: -(p.lat - lat0) * DEG2RAD * EARTH_RADIUS_M,
    }));
}

interface BboxParcel { refcat: string; ring: Array<{ lat: number; lon: number }> }

// Reuse the refcats the L-576 sweep already resolved, so layers 4 and 5 describe the SAME parcels.
const prior = JSON.parse(readFileSync(new URL('./l576-live-dissolve.json', import.meta.url), 'utf8')) as
    Array<{ refcat: string; outcome: string }>;
const withDepth = prior.filter((r) => r.outcome === 'ok').map((r) => r.refcat);
console.log(`Layer 5 over the ${withDepth.length} manzana(s) that reached a CONSTRUCTED DEPTH in L-576.\n`);

interface Row {
    refcat: string; manzana: string;
    width_m: number | null; rays: number;
    height_m: number | null; floors: number | null;
    outcome: 'height-ok' | 'band-edge-refusal' | 'no-width' | 'error';
    tier: string;
    detail: string;
}
const rows: Row[] = [];

for (const refcat of withDepth) {
    const manzana = manzanaPrefix(refcat);
    try {
        const selfUrl = 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=WFS&version=2.0.0'
            + `&request=GetFeature&STOREDQUERIE_ID=GetParcel&REFCAT=${encodeURIComponent(refcat)}&srsName=EPSG:4326`;
        const parsed = parseParcelCollectionGml(await (await fetch(selfUrl)).text()) as BboxParcel[];
        const self = parsed.find((p) => p.refcat === refcat) ?? parsed[0];
        if (!self) { rows.push({ refcat, manzana, width_m: null, rays: 0, height_m: null, floors: null, outcome: 'error', tier: 'none', detail: 'self-parcel' }); continue; }
        const lat = self.ring.reduce((s, p) => s + p.lat, 0) / self.ring.length;
        const lon = self.ring.reduce((s, p) => s + p.lon, 0) / self.ring.length;

        const all = parseParcelCollectionGml(await (await fetch(buildParcelBboxUrl(lat, lon))).text()) as BboxParcel[];
        const mine = all.filter((p) => manzanaPrefix(p.refcat) === manzana);
        const others = all.filter((p) => manzanaPrefix(p.refcat) !== manzana);

        const d = dissolveParcelsToBlockRing(mine.map((p) => project(p.ring, lat, lon)));
        if (d.degenerate) { rows.push({ refcat, manzana, width_m: null, rays: 0, height_m: null, floors: null, outcome: 'error', tier: 'none', detail: `dissolve ${d.reason}` }); continue; }

        // ⚠ Opposing rings must EXCLUDE our own block, or a ray hits our own parcels and measures 0.
        const measured = measureStreetWidths(d.ring, others.map((p) => project(p.ring, lat, lon)));
        const gov = governingStreetWidth(measured);
        if (!gov) {
            rows.push({ refcat, manzana, width_m: null, rays: measured.measurements.length, height_m: null, floors: null, outcome: 'no-width', tier: 'none', detail: `${measured.rejected.length} edge(s) rejected` });
            continue;
        }
        // The PRODUCTION tier chain: declared → snapped-to-quantum → raw measurement, with the
        // band-edge guard armed only for the raw tier.
        const amp = resolveAmpladaDeVial({
            measurement: gov,
            quantisation: BCN_STREET_WIDTH_QUANTISATION,
        });
        if (!amp) {
            rows.push({ refcat, manzana, width_m: gov.width_m, rays: measured.measurements.length, height_m: null, floors: null, outcome: 'no-width', tier: 'none', detail: 'amplada unresolved' });
            continue;
        }
        const alc = resolveAlcadaReguladora(amp.width_m, { trustedOfficialWidth: amp.trustedOfficialWidth });
        if (alc.ok) {
            rows.push({ refcat, manzana, width_m: gov.width_m, rays: measured.measurements.length, height_m: alc.height_m, floors: alc.floorsAboveGround, outcome: 'height-ok', tier: amp.provenance, detail: `band ${alc.band.minWidth_m}–${alc.band.maxWidth_m} m` });
        } else {
            rows.push({ refcat, manzana, width_m: gov.width_m, rays: measured.measurements.length, height_m: null, floors: null, outcome: alc.reason === 'band-edge' ? 'band-edge-refusal' : 'error', tier: amp.provenance, detail: `${alc.reason} straddles ${alc.straddles.join('/')} m` });
        }
    } catch (e) {
        rows.push({ refcat, manzana, width_m: null, rays: 0, height_m: null, floors: null, outcome: 'error', tier: 'none', detail: (e as Error).message });
    }
    const r = rows[rows.length - 1]!;
    console.log(`${r.outcome === 'height-ok' ? '✔' : r.outcome === 'band-edge-refusal' ? '◐' : '✖'} ${r.refcat} — ${r.outcome}` +
        `${r.width_m !== null ? ` · width ${r.width_m.toFixed(2)} m (${r.rays} rays)` : ''}` +
        `${r.height_m !== null ? ` → ${r.height_m} m / PB+${(r.floors ?? 1) - 1}` : ''} · ${r.detail}`);
    await new Promise((res) => setTimeout(res, 400));
}

const n = rows.length;
const by = (o: Row['outcome']) => rows.filter((r) => r.outcome === o).length;
const pct = (k: number) => `${((k / Math.max(n, 1)) * 100).toFixed(1)}%`;
console.log(`\n${'─'.repeat(76)}\nLAYER 5 — HEIGHT CONSTRUCTED, LIVE (n=${n} manzanas that already have a depth)\n${'─'.repeat(76)}`);
console.log(`  height constructed          : ${by('height-ok')}  ${pct(by('height-ok'))}`);
console.log(`  band-edge REFUSAL (correct) : ${by('band-edge-refusal')}  ${pct(by('band-edge-refusal'))}   ⚠ guard ${BAND_EDGE_GUARD_M} m — the design working, NOT a bug`);
console.log(`  no measurable street width  : ${by('no-width')}  ${pct(by('no-width'))}`);
console.log(`  error                       : ${by('error')}  ${pct(by('error'))}`);

const tiers = new Map<string, number>();
for (const r of rows) tiers.set(r.tier, (tiers.get(r.tier) ?? 0) + 1);
console.log('\n  provenance tier — which source actually decided each height:');
for (const [t, c] of [...tiers].sort((a, b) => b[1] - a[1])) console.log(`    ${t}: ${c}  ${pct(c)}`);

const heights = new Map<number, number>();
for (const r of rows) if (r.height_m !== null) heights.set(r.height_m, (heights.get(r.height_m) ?? 0) + 1);
console.log('\n  height distribution:');
for (const [h, c] of [...heights].sort((a, b) => a[0] - b[0])) console.log(`    ${h} m: ${c}`);

writeFileSync(new URL('./l576-layer5.json', import.meta.url), JSON.stringify(rows, null, 2));
console.log('\nrows → scratchpad/l576-layer5.json');
