// STEP 5 — REGIONAL CENSUS (not a sample).
//
// `propertyname` suppresses geometry (23x payload reduction), which makes a COMPLETE pull of all
// 122,840 Zonificacion polygons feasible in seconds. M2 is therefore a CENSUS, not an estimate:
// every zoning polygon in the Comunitat Valenciana, with its municipality and ordinance code.
//
// ANTI-TRUNCATION: the member count is asserted against `resultType=hits` on every pass. A pass
// whose member count disagrees with hits is discarded rather than reported.
import fs from 'node:fs';
import path from 'node:path';
import { BASE, DIR, get, owsException, countMembers } from './lib.mjs';

const TN = 'ms:Planeamiento.Zonificacion';

async function hitsAll(tn) {
    const u = `${BASE}?service=WFS&version=1.1.0&request=GetFeature&typename=${encodeURIComponent(tn)}&resultType=hits`;
    const r = await get(u, 180000);
    const m = r.body.match(/numberOfFeatures="(\d+)"/) || r.body.match(/numberMatched="(\d+)"/);
    return m ? Number(m[1]) : null;
}

async function pull(tn, fields, outFile) {
    const expect = await hitsAll(tn);
    const u = `${BASE}?service=WFS&version=1.1.0&request=GetFeature&typename=${encodeURIComponent(tn)}&propertyname=${encodeURIComponent(fields.join(','))}`;
    const t = Date.now();
    const r = await get(u, 560000);
    const exc = owsException(r.body);
    if (!r.ok || exc) {
        console.error(`  ${tn} [${fields.join(',')}]: UNKNOWN ${(exc || r.http || r.err)}`);
        return { st: 'UNKNOWN', why: exc || `HTTP ${r.http ?? r.err}` };
    }
    const n = countMembers(r.body);
    fs.writeFileSync(path.join(DIR, outFile), r.body);
    const ok = expect != null && n === expect;
    console.error(
        `  ${tn} [${fields.length}f]: members=${n} hits=${expect} ${ok ? 'AGREE' : '**DISAGREE**'} bytes=${r.body.length} ${((Date.now() - t) / 1000).toFixed(1)}s -> ${outFile}`
    );
    return { st: ok ? 'OK' : 'TRUNCATION-SUSPECT', members: n, hits: expect, bytes: r.body.length, file: outFile };
}

const manifest = { pulledAt: new Date().toISOString(), passes: {} };

// Pass A — the grammar census: municipality, ordinance code, soil class, human description.
manifest.passes.A = await pull(TN, ['cod_ine_mun', 'zon_suelo', 'clas_suelo', 'descripcio'], '_census_A.xml');

// Pass B — provenance: is url_abs per-municipality, or the national "UrlLink trap"
// (99% populated but only 20 distinct values = register home pages, not documents)?
manifest.passes.B = await pull(TN, ['cod_ine_mun', 'noms_mun', 'url_abs', 'expediente'], '_census_B.xml');

fs.writeFileSync(path.join(DIR, '_05_census_manifest.json'), JSON.stringify(manifest, null, 1));
