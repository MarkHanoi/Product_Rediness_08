// STEP 0 — RECON. Enumerate typenames (GetCapabilities) and the DECLARED SCHEMA
// (DescribeFeatureType) for every planning typename.
//
// DescribeFeatureType is the single highest-value call in this run: it answers, without any
// correspondence, (a) M1's "one schema or 542?" at the SERVICE level, (b) M3's "does buildable
// depth appear as a field anywhere", and (c) whether INSPIRE provenance fields exist at all.
//
// ⚠ A field being DECLARED here is not evidence it is POPULATED. That is measured in 02/03.
import { BASE, get, save, owsException } from './lib.mjs';

const caps = {};

for (const ver of ['1.1.0', '2.0.0']) {
    const u = `${BASE}?service=WFS&version=${ver}&request=GetCapabilities`;
    const r = await get(u);
    const exc = owsException(r.body);
    const names = [...r.body.matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1]);
    caps[ver] = {
        http: r.http,
        ok: r.ok,
        exception: exc,
        bytes: r.body.length,
        names: [...new Set(names)],
    };
    console.error(`caps ${ver}: HTTP ${r.http} names=${caps[ver].names.length} ${exc ? 'EXC ' + exc : ''}`);
}

// Default CRS + supported CRS advertised per layer (feeds the axis/CRS matrix rationale).
const capsBody = await get(`${BASE}?service=WFS&version=1.1.0&request=GetCapabilities`);
const srsDecl = [...capsBody.body.matchAll(/<DefaultSRS>([^<]+)<\/DefaultSRS>/g)].map((m) => m[1]);
const otherSrs = [...new Set([...capsBody.body.matchAll(/<OtherSRS>([^<]+)<\/OtherSRS>/g)].map((m) => m[1]))];

const typenames = (caps['1.1.0'].names || []).filter((n) => n.includes(':') || /Planeamiento/i.test(n));

const schemas = {};
for (const tn of typenames) {
    const u = `${BASE}?service=WFS&version=1.1.0&request=DescribeFeatureType&typename=${encodeURIComponent(tn)}`;
    const r = await get(u);
    const exc = owsException(r.body);
    if (!r.ok || exc) {
        schemas[tn] = { st: 'UNKNOWN', why: exc || `HTTP ${r.http ?? r.err}` };
        console.error(`  ${tn}: UNKNOWN ${schemas[tn].why}`);
        continue;
    }
    const els = [...r.body.matchAll(/<element\s+([^>]*)\/>/g)].map((m) => {
        const a = m[1];
        const name = (a.match(/name="([^"]+)"/) || [])[1];
        const type = (a.match(/type="([^"]+)"/) || [])[1];
        const nillable = /nillable="true"/.test(a);
        return { name, type, nillable };
    });
    schemas[tn] = { st: 'OK', fields: els };
    console.error(`  ${tn}: ${els.length} fields -> ${els.map((e) => e.name).join(',')}`);
}

save('_00_recon.json', { base: BASE, caps, srsDefault: [...new Set(srsDecl)], srsOther: otherSrs, schemas });
console.error(`\nDefaultSRS seen: ${[...new Set(srsDecl)].join(', ')}`);
console.error(`OtherSRS seen: ${otherSrs.slice(0, 12).join(', ')}`);
