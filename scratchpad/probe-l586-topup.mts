// §L-586 — re-run the layer-5 chain for named refcats only, and MERGE into the AFTER file.
//
// WHY THIS EXISTS. Two rows of the AFTER sweep failed with a bare `fetch failed` against Catastro,
// which is upstream flakiness, not a result. Leaving them in as failures would understate the rate
// by attributing a network blip to the engine; silently deleting them would overstate it by
// dropping parcels. So they are RE-MEASURED and merged, and the merge is recorded.
//
// Run:  npx tsx scratchpad/probe-l586-topup.mts <refcat> [refcat…]

import {
    buildParcelBboxUrl, parseParcelCollectionGml, manzanaPrefix, parseReverseGeocode,
    CATASTRO_RCCOOR_ENDPOINT,
} from '../server/parcelZoningProxy.js';
import { dissolveParcelsToBlockRing } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import {
    measureStreetWidths, governingStreetWidth, blockEdgesFacingParcel,
} from '../packages/site-parcel-data/src/geometry/streetWidth.js';
import { resolveAlcadaReguladora } from '../packages/site-parcel-data/src/rulepacks/bcnAlcadaReguladora.js';
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

const targets = process.argv.slice(2);
const file = new URL('./l586-layer5-AFTER-fix.json', import.meta.url);
const rows = JSON.parse(readFileSync(file, 'utf8')) as Array<Record<string, unknown>>;

/** Retry only the TRANSPORT. A deterministic refusal must never be retried into an answer. */
async function getText(url: string, attempts = 4): Promise<string> {
    let last: unknown;
    for (let i = 0; i < attempts; i++) {
        try { return await (await fetch(url)).text(); } catch (e) { last = e; }
        await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
    throw last;
}

for (const refcat of targets) {
    const manzana = manzanaPrefix(refcat);
    const selfUrl = 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=WFS&version=2.0.0'
        + `&request=GetFeature&STOREDQUERIE_ID=GetParcel&REFCAT=${encodeURIComponent(refcat)}&srsName=EPSG:4326`;
    const parsed = parseParcelCollectionGml(await getText(selfUrl)) as BboxParcel[];
    const self = parsed.find((p) => p.refcat === refcat) ?? parsed[0]!;
    const lat = self.ring.reduce((s, p) => s + p.lat, 0) / self.ring.length;
    const lon = self.ring.reduce((s, p) => s + p.lon, 0) / self.ring.length;

    const rc = parseReverseGeocode(await getText(
        `${CATASTRO_RCCOOR_ENDPOINT}?SRS=EPSG:4326&Coordenada_X=${lon}&Coordenada_Y=${lat}`));
    const address = rc?.address ?? null;
    const declared = address ? officialStreetWidthForAddress(address) : null;

    const all = parseParcelCollectionGml(await getText(buildParcelBboxUrl(lat, lon))) as BboxParcel[];
    const mine = all.filter((p) => manzanaPrefix(p.refcat) === manzana);
    const others = all.filter((p) => manzanaPrefix(p.refcat) !== manzana);
    const d = dissolveParcelsToBlockRing(mine.map((p) => project(p.ring, lat, lon)));
    if (d.degenerate) { console.log(`✖ ${refcat} dissolve ${d.reason}`); continue; }

    const measured = measureStreetWidths(d.ring, others.map((p) => project(p.ring, lat, lon)));
    const facing = blockEdgesFacingParcel(d.ring, project(self.ring, lat, lon));
    const gov = governingStreetWidth(measured, facing.length > 0 ? facing : undefined);
    const amp = resolveAmpladaDeVial({ declared, measurement: gov, quantisation: BCN_STREET_WIDTH_QUANTISATION });

    const row = rows.find((r) => r.refcat === refcat)!;
    row.address = address;
    row.street = address ? streetNameFromCatastroAddress(address) : '';
    row.facing = facing;
    row.govWidth = gov ? +gov.width_m.toFixed(3) : null;
    row.govSpread = gov ? +gov.spread_m.toFixed(3) : null;
    row.detail = 'topped up after a transient upstream fetch failure';
    if (!amp) { row.outcome = 'no-width'; row.tier = 'none'; console.log(`✖ ${refcat} no-width`); continue; }
    row.tier = amp.provenance;
    row.width_m = +amp.width_m.toFixed(3);
    const alc = resolveAlcadaReguladora(amp.width_m, {
        trustedOfficialWidth: amp.trustedOfficialWidth,
        measurementSpread_m: amp.measurementSpread_m,
    });
    if (alc.ok) {
        row.outcome = 'height-ok'; row.height_m = alc.height_m; row.floors = alc.floorsAboveGround;
        console.log(`✔ ${refcat} [${row.street}] ${amp.width_m} m (${amp.provenance}) → ${alc.height_m} m PB+${alc.floorsAboveGround}`);
    } else {
        row.outcome = alc.reason === 'band-edge' ? 'band-edge-refusal' : 'error';
        row.straddles = [...alc.straddles];
        console.log(`◐ ${refcat} [${row.street}] ${alc.reason}`);
    }
}

writeFileSync(file, JSON.stringify(rows, null, 2));
const by = (o: string) => rows.filter((r) => r.outcome === o).length;
console.log(`\nmerged. height-ok ${by('height-ok')}/${rows.length} = ${((by('height-ok') / rows.length) * 100).toFixed(1)}% · ` +
    `band-edge ${by('band-edge-refusal')} · error ${by('error')} · no-width ${by('no-width')}`);
