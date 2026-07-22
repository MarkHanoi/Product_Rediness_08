// TASK 4 / LAYER 6 — DOES THE GEOMETRY WE DISPATCH TO THE RENDERER SURVIVE ITS OWN INVARIANTS?
//
// An envelope can be legally correct and still wrong on screen, and NOTHING checks this today.
// The founder's minimum bar: the dispatched inset polygon is non-degenerate, is CONTAINED in the
// ring it was derived from, and the volume identity `maxVolume = insetArea × maxHeight` holds.
//
// ⚠ SCOPE, STATED HONESTLY: this exercises the Art. 242.2 BLOCK-DERIVED construction — the same
// `solveBlockDerivedDepth` + `insetPolygonPerEdge` production uses for clau 13a — over the parcels
// that already cleared layers 4 and 5. It does NOT run `computeBuildableEnvelope`, because that
// needs a live clau lookup per parcel. So this measures the geometry ENGINE, not the full dispatch
// path; a green result here means "the shape is sound", not "the screen is correct".
//
// ⚠ WHY THE FRONT-EDGE CLASSIFICATION IS DERIVED FROM THE WIDTH MEASUREMENT: Art. 242 measures
// depth from the STREET frontages. An edge is a street frontage exactly when a ray cast from it
// reached an opposing frontage — which is what `measureStreetWidths` establishes. Inventing a
// classification would make this probe measure my assumption instead of the construction.
//
// Run:  npx tsx scratchpad/probe-l576-layer6.mts

import { buildParcelBboxUrl, parseParcelCollectionGml, manzanaPrefix } from '../server/parcelZoningProxy.js';
import { dissolveParcelsToBlockRing } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import { measureStreetWidths } from '../packages/site-parcel-data/src/geometry/streetWidth.js';
import { solveBlockDerivedDepth } from '../packages/site-parcel-data/src/geometry/blockDerivedDepth.js';
import { insetPolygonPerEdge } from '../packages/site-parcel-data/src/geometry/insetPolygon.js';
import { checkEnvelopeContainment } from '../packages/site-parcel-data/src/envelopeContainment.js';
import type { Pt } from '@pryzm/schemas';
import { readFileSync, writeFileSync } from 'node:fs';

const EARTH_RADIUS_M = 6_378_137;
const DEG2RAD = Math.PI / 180;
// PGM Art. 242.2 constants — the ordinance numbers, not tuned values.
const INTERIOR_FREE_RATIO = 0.30;
const MIN_DEPTH_M = 11;
const MAX_DEPTH_M = 30;

const project = (ring: Array<{ lat: number; lon: number }>, lat0: number, lon0: number): Pt[] => {
    const cos0 = Math.cos(lat0 * DEG2RAD);
    return ring.map((p) => ({
        x: (p.lon - lon0) * DEG2RAD * EARTH_RADIUS_M * cos0,
        z: -(p.lat - lat0) * DEG2RAD * EARTH_RADIUS_M,
    }));
};
const areaOf = (r: ReadonlyArray<Pt>): number => {
    if (r.length < 3) return 0;
    let a = 0;
    for (let i = 0; i < r.length; i++) { const p = r[i]!, q = r[(i + 1) % r.length]!; a += p.x * q.z - q.x * p.z; }
    return Math.abs(a) / 2;
};

interface BboxParcel { refcat: string; ring: Array<{ lat: number; lon: number }> }
const layer5 = JSON.parse(readFileSync(new URL('./l576-layer5.json', import.meta.url), 'utf8')) as
    Array<{ refcat: string; outcome: string; height_m: number | null }>;
const subjects = layer5.filter((r) => r.outcome === 'height-ok' && r.height_m !== null);
console.log(`Layer 6 over the ${subjects.length} manzana(s) that cleared BOTH depth (L-576) and height.\n`);

interface Row {
    refcat: string; height_m: number;
    depth_m: number | null; binding: string | null;
    nonDegenerate: boolean; contained: boolean; ratioHonoured: boolean; volumeIdentity: boolean;
    insetAreaM2: number | null; blockAreaM2: number | null; worstExcursionM: number | null;
    verdict: 'sound' | 'DEGENERATE' | 'NOT-CONTAINED' | 'RATIO-VIOLATED' | 'VOLUME-MISMATCH' | 'error';
    detail: string;
}
const rows: Row[] = [];

for (const subj of subjects) {
    const manzana = manzanaPrefix(subj.refcat);
    const base: Row = {
        refcat: subj.refcat, height_m: subj.height_m!, depth_m: null, binding: null,
        nonDegenerate: false, contained: false, ratioHonoured: false, volumeIdentity: false,
        insetAreaM2: null, blockAreaM2: null, worstExcursionM: null, verdict: 'error', detail: '',
    };
    try {
        const selfUrl = 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=WFS&version=2.0.0'
            + `&request=GetFeature&STOREDQUERIE_ID=GetParcel&REFCAT=${encodeURIComponent(subj.refcat)}&srsName=EPSG:4326`;
        const parsed = parseParcelCollectionGml(await (await fetch(selfUrl)).text()) as BboxParcel[];
        const self = parsed.find((p) => p.refcat === subj.refcat) ?? parsed[0];
        if (!self) { rows.push({ ...base, detail: 'self-parcel' }); continue; }
        const lat = self.ring.reduce((s, p) => s + p.lat, 0) / self.ring.length;
        const lon = self.ring.reduce((s, p) => s + p.lon, 0) / self.ring.length;

        const all = parseParcelCollectionGml(await (await fetch(buildParcelBboxUrl(lat, lon))).text()) as BboxParcel[];
        const mine = all.filter((p) => manzanaPrefix(p.refcat) === manzana);
        const others = all.filter((p) => manzanaPrefix(p.refcat) !== manzana);
        const d = dissolveParcelsToBlockRing(mine.map((p) => project(p.ring, lat, lon)));
        if (d.degenerate) { rows.push({ ...base, detail: `dissolve ${d.reason}` }); continue; }

        // An edge is a street FRONTAGE exactly when a ray from it reached an opposing frontage.
        const measured = measureStreetWidths(d.ring, others.map((p) => project(p.ring, lat, lon)));
        const frontEdges = new Set(measured.measurements.map((m) => m.edgeIndex));
        const cls = d.ring.map((_, i) => (frontEdges.has(i) ? 'front' : 'side')) as never[];

        const depth = solveBlockDerivedDepth({
            blockRing: d.ring, blockEdgeClassifications: cls,
            interiorFreeRatio: INTERIOR_FREE_RATIO, minDepth_m: MIN_DEPTH_M, maxDepth_m: MAX_DEPTH_M,
        });
        if (depth.degenerate) { rows.push({ ...base, depth_m: depth.depth_m, binding: depth.binding, detail: 'depth degenerate — ordinance cannot be honoured' }); continue; }

        // The BUILDABLE BAND: the block eroded from its street frontages by the solved depth is the
        // interior COURTYARD; the band itself is what the ordinance grants. Check the courtyard
        // ring, which is the polygon the construction actually produces and dispatches.
        const inset = insetPolygonPerEdge(d.ring, cls, { front: depth.depth_m, side: 0, rear: 0, unclassified: 0 });
        const insetArea = inset.degenerate ? 0 : areaOf(inset.polygon);
        const blockArea = areaOf(d.ring);

        const nonDegenerate = !inset.degenerate && inset.polygon.length >= 3 && insetArea > 0;
        // Containment: pass the BLOCK ring as the reference and the inset as the footprint. The
        // inset is an erosion, so it must lie strictly inside — if it escapes, the inset is wrong.
        const cont = checkEnvelopeContainment(
            d.ring.map((p) => ({ x: p.x, z: p.z })),
            nonDegenerate ? [{ id: subj.refcat, ring: inset.polygon.map((p) => ({ x: p.x, z: p.z })) }] : [],
        );
        const ratioHonoured = depth.achievedFreeRatio >= INTERIOR_FREE_RATIO - 1e-6;
        // ⚠ THE VOLUME IDENTITY IS DELIBERATELY NOT CHECKED HERE, and the first draft of this
        // probe DID "check" it — by computing `insetArea × height` and comparing it to
        // `insetArea × height`. That is a tautology: it can never fail, so it would have reported
        // 100% and meant nothing. The identity is only testable against the number the ENGINE
        // produces (`computeBuildableEnvelope().maxVolumeM3`), which this probe does not run.
        // Reporting a vacuous pass would be worse than reporting nothing.
        const volumeIdentity = true; // NOT MEASURED — see above. Excluded from the verdict.

        const verdict: Row['verdict'] = !nonDegenerate ? 'DEGENERATE'
            : !cont.ok ? 'NOT-CONTAINED'
            : !ratioHonoured ? 'RATIO-VIOLATED'
            : 'sound';
        rows.push({
            ...base, depth_m: depth.depth_m, binding: depth.binding,
            nonDegenerate, contained: cont.ok, ratioHonoured, volumeIdentity,
            insetAreaM2: insetArea, blockAreaM2: blockArea, worstExcursionM: cont.worstExcursionM,
            verdict,
            detail: `depth ${depth.depth_m.toFixed(1)} m (${depth.binding}) · free ratio ${(depth.achievedFreeRatio * 100).toFixed(1)}% · courtyard ${insetArea.toFixed(0)} m² of block ${blockArea.toFixed(0)} m²`,
        });
    } catch (e) {
        rows.push({ ...base, detail: (e as Error).message });
    }
    const r = rows[rows.length - 1]!;
    console.log(`${r.verdict === 'sound' ? '✔' : '✖'} ${r.refcat} — ${r.verdict} · ${r.detail}`);
    await new Promise((res) => setTimeout(res, 400));
}

const n = rows.length;
const by = (v: Row['verdict']) => rows.filter((r) => r.verdict === v).length;
const pct = (k: number) => `${((k / Math.max(n, 1)) * 100).toFixed(1)}%`;
console.log(`\n${'─'.repeat(76)}\nLAYER 6 — GEOMETRY SOUND, LIVE (n=${n} manzanas that cleared depth AND height)\n${'─'.repeat(76)}`);
console.log(`  sound            : ${by('sound')}  ${pct(by('sound'))}`);
console.log(`  DEGENERATE       : ${by('DEGENERATE')}  ${pct(by('DEGENERATE'))}`);
console.log(`  NOT-CONTAINED    : ${by('NOT-CONTAINED')}  ${pct(by('NOT-CONTAINED'))}`);
console.log(`  RATIO-VIOLATED   : ${by('RATIO-VIOLATED')}  ${pct(by('RATIO-VIOLATED'))}`);
console.log('  volume identity  : NOT MEASURED — needs computeBuildableEnvelope (see the note in this file)');
console.log(`  error            : ${by('error')}  ${pct(by('error'))}`);

const bindings = new Map<string, number>();
for (const r of rows) if (r.binding) bindings.set(r.binding, (bindings.get(r.binding) ?? 0) + 1);
console.log('\n  which ordinance rule BOUND the depth:');
for (const [b, c] of [...bindings].sort((a, b2) => b2[1] - a[1])) console.log(`    ${b}: ${c}  ${pct(c)}`);

writeFileSync(new URL('./l576-layer6.json', import.meta.url), JSON.stringify(rows, null, 2));
console.log('\nrows → scratchpad/l576-layer6.json');
