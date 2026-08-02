import { readFileSync } from 'node:fs';
const d = JSON.parse(readFileSync(new URL('./refusal-audit.raw.json', import.meta.url), 'utf8'));
for (const [c, r] of Object.entries(d)) {
    console.log('==', c, 'samples', r.samples.length, 'draws', r.draws, 'skipped', r.skipped.length, 'failures', r.failures.length);
    const byZone = {}; for (const s of r.samples) byZone[s.zone] = (byZone[s.zone] || 0) + 1;
    console.log('  zones:', JSON.stringify(byZone));
    const fr = {}; for (const f of r.failures) fr[f.reason] = (fr[f.reason] || 0) + 1;
    if (r.failures.length) console.log('  FAILURES:', JSON.stringify(fr));
    if (c === 'barcelona') for (const s of r.samples.filter((x) => x.zone === '18')) console.log('   18 @', s.lat, s.lon, 'OV=', JSON.stringify(s.ovProbe));
    if (c === 'murcia') for (const s of r.samples) console.log('   ', s.id, s.lat, s.lon, JSON.stringify(s.attrs));
    if (c === 'valencia') for (const s of r.samples) console.log('   ', s.id, s.lat, s.lon, JSON.stringify(s.attrs));
    if (c === 'cordoba') for (const s of r.samples) console.log('   ', s.id, s.lat, s.lon, s.zone, '|', s.article);
}
