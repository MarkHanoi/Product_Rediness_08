// L-586 / LAYER 5 — WHY does the height layer refuse on 21.7% of parcels?
//
// The L-576 layer-5 probe answered "how many", not "why", and it did NOT measure the system
// production runs. Two divergences, both material:
//
//   1. It never called `officialStreetWidthForAddress` — TIER 2 (the curated Cerdà allow-list)
//      was entirely absent, so no parcel could ever resolve `curated-cerda-nominal`.
//   2. It called `governingStreetWidth(measured)` with NO edge restriction, i.e. the NARROWEST
//      street anywhere around the whole manzana. Production restricts to the block edges the
//      PARCEL actually fronts (`blockEdgesFacingParcel`), precisely because the whole-block
//      minimum under-builds a parcel that fronts only the wide artery. On a Cerdà block with one
//      narrow pre-Cerdà face, the old probe attributes that face's ~7.9 m to every parcel.
//
// So this probe reproduces `siteDispatch.ts` exactly, and additionally records EVERY per-edge
// measurement, every rejection reason, the parcel's postal address, and the exact band-edge
// straddle — so the 21.7% can be classified by CAUSE rather than counted.
//
// ⚠ NOTHING HERE INVENTS A HEIGHT. A refusal is an outcome, not a failure to be engineered away.
//
// Run:  npx tsx scratchpad/probe-l586-layer5-diagnose.mts

import {
    buildParcelBboxUrl, parseParcelCollectionGml, manzanaPrefix, parseReverseGeocode,
    CATASTRO_RCCOOR_ENDPOINT,
} from '../server/parcelZoningProxy.js';
import { dissolveParcelsToBlockRing } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import {
    measureStreetWidths, governingStreetWidth, blockEdgesFacingParcel,
} from '../packages/site-parcel-data/src/geometry/streetWidth.js';
import { resolveAlcadaReguladora, BAND_EDGE_GUARD_M } from '../packages/site-parcel-data/src/rulepacks/bcnAlcadaReguladora.js';
import { resolveAmpladaDeVial, BCN_STREET_WIDTH_QUANTISATION } from '../packages/site-parcel-data/src/rulepacks/ampladaDeVial.js';
import { officialStreetWidthForAddress, streetNameFromCatastroAddress } from '../packages/site-parcel-data/src/rulepacks/bcnOfficialStreetWidths.js';
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

const prior = JSON.parse(readFileSync(new URL('./l576-live-dissolve.json', import.meta.url), 'utf8')) as
    Array<{ refcat: string; outcome: string }>;
const subjects = prior.filter((r) => r.outcome === 'ok').map((r) => r.refcat);
console.log(`L-586 diagnose over the ${subjects.length} manzana(s) that reached a CONSTRUCTED DEPTH.\n`);

type Outcome = 'height-ok' | 'band-edge-refusal' | 'no-width' | 'no-ring' | 'error';

interface Row {
    refcat: string; manzana: string; address: string | null; street: string;
    declaredHit: boolean;
    facing: number[]; facingEmpty: boolean;
    edges: Array<{ i: number; w: number; spread: number; len: number; n: number }>;
    rejects: Array<{ i: number; reason: string; len: number }>;
    govWidth: number | null; govSpread: number | null; govEdge: number | null;
    /** What the OLD probe would have picked — whole-block minimum. For the divergence count. */
    wholeBlockMinWidth: number | null;
    tier: string; width_m: number | null;
    height_m: number | null; floors: number | null;
    outcome: Outcome; straddles: number[]; detail: string;
}
const rows: Row[] = [];

for (const refcat of subjects) {
    const manzana = manzanaPrefix(refcat);
    const base: Row = {
        refcat, manzana, address: null, street: '', declaredHit: false,
        facing: [], facingEmpty: true, edges: [], rejects: [],
        govWidth: null, govSpread: null, govEdge: null, wholeBlockMinWidth: null,
        tier: 'none', width_m: null, height_m: null, floors: null,
        outcome: 'error', straddles: [], detail: '',
    };
    try {
        const selfUrl = 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=WFS&version=2.0.0'
            + `&request=GetFeature&STOREDQUERIE_ID=GetParcel&REFCAT=${encodeURIComponent(refcat)}&srsName=EPSG:4326`;
        const parsed = parseParcelCollectionGml(await (await fetch(selfUrl)).text()) as BboxParcel[];
        const self = parsed.find((p) => p.refcat === refcat) ?? parsed[0];
        if (!self) { rows.push({ ...base, detail: 'self-parcel not returned' }); continue; }
        const lat = self.ring.reduce((s, p) => s + p.lat, 0) / self.ring.length;
        const lon = self.ring.reduce((s, p) => s + p.lon, 0) / self.ring.length;

        // TIER 2 input — the postal address, which production reads off the parcel feature.
        const rcXml = await (await fetch(
            `${CATASTRO_RCCOOR_ENDPOINT}?SRS=EPSG:4326&Coordenada_X=${lon}&Coordenada_Y=${lat}`,
        )).text();
        const rc = parseReverseGeocode(rcXml);
        base.address = rc?.address ?? null;
        base.street = base.address ? streetNameFromCatastroAddress(base.address) : '';
        const declared = base.address ? officialStreetWidthForAddress(base.address) : null;
        base.declaredHit = declared !== null;

        const all = parseParcelCollectionGml(await (await fetch(buildParcelBboxUrl(lat, lon))).text()) as BboxParcel[];
        const mine = all.filter((p) => manzanaPrefix(p.refcat) === manzana);
        const others = all.filter((p) => manzanaPrefix(p.refcat) !== manzana);

        const d = dissolveParcelsToBlockRing(mine.map((p) => project(p.ring, lat, lon)));
        if (d.degenerate) { rows.push({ ...base, outcome: 'no-ring', detail: `dissolve ${d.reason}` }); continue; }

        const parcelRing = project(self.ring, lat, lon);
        const measured = measureStreetWidths(d.ring, others.map((p) => project(p.ring, lat, lon)));
        base.edges = measured.measurements.map((m) => ({
            i: m.edgeIndex, w: +m.width_m.toFixed(3), spread: +m.spread_m.toFixed(3),
            len: +m.edgeLength_m.toFixed(1), n: m.sampleCount,
        }));
        base.rejects = measured.rejected.map((r) => ({ i: r.edgeIndex, reason: r.reason, len: +r.edgeLength_m.toFixed(1) }));

        const facing = blockEdgesFacingParcel(d.ring, parcelRing);
        base.facing = facing;
        base.facingEmpty = facing.length === 0;

        const wholeBlock = governingStreetWidth(measured);
        base.wholeBlockMinWidth = wholeBlock ? +wholeBlock.width_m.toFixed(3) : null;

        const gov = governingStreetWidth(measured, facing.length > 0 ? facing : undefined);
        if (gov) {
            base.govWidth = +gov.width_m.toFixed(3);
            base.govSpread = +gov.spread_m.toFixed(3);
            base.govEdge = gov.edgeIndex;
        }

        const amp = resolveAmpladaDeVial({ declared, measurement: gov, quantisation: BCN_STREET_WIDTH_QUANTISATION });
        if (!amp) {
            rows.push({
                ...base, outcome: 'no-width',
                detail: `${measured.measurements.length} measured / ${measured.rejected.length} rejected; ` +
                    `facing [${facing.join(',')}]`,
            });
            continue;
        }
        base.tier = amp.provenance;
        base.width_m = +amp.width_m.toFixed(3);

        // §L-586 — the guard now also receives the measurement's OWN error bar. Production wires
        // the same value through `resolveBcnAlcadaForZone`.
        const alc = resolveAlcadaReguladora(amp.width_m, {
            trustedOfficialWidth: amp.trustedOfficialWidth,
            measurementSpread_m: amp.measurementSpread_m,
        });
        if (alc.ok) {
            rows.push({
                ...base, outcome: 'height-ok', height_m: alc.height_m, floors: alc.floorsAboveGround,
                detail: `band ${alc.band.minWidth_m}–${alc.band.maxWidth_m} m`,
            });
        } else {
            rows.push({
                ...base, outcome: alc.reason === 'band-edge' ? 'band-edge-refusal' : 'error',
                straddles: [...alc.straddles], detail: alc.reason,
            });
        }
    } catch (e) {
        rows.push({ ...base, detail: (e as Error).message });
    }
    const r = rows[rows.length - 1]!;
    const mark = r.outcome === 'height-ok' ? '✔' : r.outcome === 'band-edge-refusal' ? '◐' : '✖';
    console.log(`${mark} ${r.refcat} [${r.street || '?'}] ${r.outcome}` +
        `${r.width_m !== null ? ` · ${r.width_m.toFixed(2)} m (${r.tier})` : ''}` +
        `${r.govWidth !== null && r.wholeBlockMinWidth !== null && Math.abs(r.govWidth - r.wholeBlockMinWidth) > 0.01 ? ` ⚠facing≠block(${r.wholeBlockMinWidth})` : ''}` +
        `${r.height_m !== null ? ` → ${r.height_m} m PB+${r.floors}` : ''} · ${r.detail}`);
    await new Promise((res) => setTimeout(res, 350));
}

const n = rows.length;
const by = (o: Outcome) => rows.filter((r) => r.outcome === o).length;
const pct = (k: number) => `${((k / Math.max(n, 1)) * 100).toFixed(1)}%`;
console.log(`\n${'─'.repeat(78)}\nL-586 LAYER 5 (n=${n})\n${'─'.repeat(78)}`);
for (const o of ['height-ok', 'band-edge-refusal', 'no-width', 'no-ring', 'error'] as Outcome[]) {
    console.log(`  ${o.padEnd(20)}: ${by(o)}  ${pct(by(o))}`);
}
const tiers = new Map<string, number>();
for (const r of rows) tiers.set(r.tier, (tiers.get(r.tier) ?? 0) + 1);
console.log('\n  provenance tier:');
for (const [t, c] of [...tiers].sort((a, b) => b[1] - a[1])) console.log(`    ${t}: ${c}  ${pct(c)}`);

console.log('\n  facing-edge restriction vs whole-block minimum:');
const diverged = rows.filter((r) => r.govWidth !== null && r.wholeBlockMinWidth !== null && Math.abs(r.govWidth - r.wholeBlockMinWidth) > 0.01);
console.log(`    diverged on ${diverged.length} parcel(s); facingEmpty on ${rows.filter((r) => r.facingEmpty && r.edges.length > 0).length}`);

console.log('\n  band-edge refusals, by straddle:');
const straddleGroups = new Map<string, Row[]>();
for (const r of rows) if (r.outcome === 'band-edge-refusal') {
    const k = r.straddles.join('/');
    straddleGroups.set(k, [...(straddleGroups.get(k) ?? []), r]);
}
for (const [k, g] of [...straddleGroups].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`    ${k} m — ${g.length}`);
    for (const r of g) console.log(`      ${r.refcat} [${r.street || '?'}] w=${r.width_m?.toFixed(3)} spread=${r.govSpread?.toFixed(3)} edge=${r.govEdge} facing=[${r.facing.join(',')}]`);
}

console.log('\n  rejection reasons across ALL block edges:');
const rj = new Map<string, number>();
for (const r of rows) for (const x of r.rejects) rj.set(x.reason, (rj.get(x.reason) ?? 0) + 1);
for (const [k, c] of [...rj].sort((a, b) => b[1] - a[1])) console.log(`    ${k}: ${c}`);

writeFileSync(new URL('./l586-layer5-AFTER-fix.json', import.meta.url), JSON.stringify(rows, null, 2));
console.log(`\nguard = ${BAND_EDGE_GUARD_M} m · rows → scratchpad/l586-layer5-AFTER-fix.json`);
