// TEMPORAL-VALIDITY CONTROL (coordinator, 2026-08-02): "if superseded geometry is served alongside
// current geometry and nothing filters it, an envelope gets computed from a REPEALED alignment —
// an over-grant, L-616 class." Murcia's `f_fin` is already filtered by the join. This asks the same
// question of the other four publishers' layers, rather than assuming they have no validity field.
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';

async function counts(label, base, where) {
    const url = `${base}?where=${encodeURIComponent(where)}&returnCountOnly=true&f=json`;
    const res = await fetch(url, { headers: { 'user-agent': BROWSER } });
    const t = await res.text();
    try { console.log(`  ${label.padEnd(46)} ${JSON.parse(t).count}`); }
    catch { console.log(`  ${label.padEnd(46)} ${res.status} ${t.slice(0, 120).replace(/\s+/g, ' ')}`); }
}

console.log('VALÈNCIA — geoportal.valencia.es .../MapServer/231 (fields incl. operacionbaja, bloqueo, fecha_valor)');
const V = 'https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer/231/query';
await counts('ALL rows', V, '1=1');
await counts("operacionbaja IS NULL", V, 'operacionbaja IS NULL');
await counts("operacionbaja IS NOT NULL  (⚠ superseded?)", V, 'operacionbaja IS NOT NULL');
await counts('bloqueo IS NOT NULL', V, 'bloqueo IS NOT NULL');

console.log('\nBARCELONA — AMB Refós qualificacio_refos_3857/MapServer/16');
const B = 'https://geoportal.amb.cat/geoserveis/rest/services/qualificacio_refos_3857/MapServer/16/query';
await counts("CODI_INE='08019' ALL", B, "CODI_INE='08019'");
const meta = await (await fetch('https://geoportal.amb.cat/geoserveis/rest/services/qualificacio_refos_3857/MapServer/16?f=json', { headers: { 'user-agent': BROWSER } })).text();
try {
    const j = JSON.parse(meta);
    console.log('  fields:', (j.fields ?? []).map((f) => f.name).join(', '));
} catch { console.log('  (metadata unreadable)'); }

console.log('\nMADRID — sigma.madrid.es NORMAS_ZONALES/MapServer/0');
const M = 'https://sigma.madrid.es/hosted/rest/services/DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer/0/query';
await counts('ALL rows', M, '1=1');
const mm = await (await fetch('https://sigma.madrid.es/hosted/rest/services/DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer/0?f=json', { headers: { 'user-agent': BROWSER } })).text();
try {
    const j = JSON.parse(mm);
    console.log('  fields:', (j.fields ?? []).map((f) => f.name).join(', '));
} catch { console.log('  (metadata unreadable)'); }
